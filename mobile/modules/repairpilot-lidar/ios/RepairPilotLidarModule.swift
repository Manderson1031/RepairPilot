import ExpoModulesCore
import ARKit
import AVFoundation
import CoreVideo
import CoreImage
import UIKit
import simd

private enum RepairPilotLidarError: Error {
  case unsupported
  case sessionNotRunning
  case depthUnavailable
  case invalidPoint
  case invalidDepth
  case imageEncodingFailed
}

private extension Notification.Name {
  static let repairPilotPauseCameraPreview = Notification.Name("RepairPilotPauseCameraPreview")
  static let repairPilotResumeCameraPreview = Notification.Name("RepairPilotResumeCameraPreview")
}

final class RepairPilotLidarPreviewView: ExpoView {
  private let captureSession = AVCaptureSession()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let sessionQueue = DispatchQueue(label: "repairpilot.camera.preview")
  private var configured = false

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
    super.init(appContext: appContext)
    backgroundColor = .black
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    NotificationCenter.default.addObserver(self, selector: #selector(pausePreview), name: .repairPilotPauseCameraPreview, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(resumePreview), name: .repairPilotResumeCameraPreview, object: nil)
    configurePreview()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    captureSession.stopRunning()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
    if let connection = previewLayer.connection, connection.isVideoRotationAngleSupported(90) {
      connection.videoRotationAngle = 90
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { startPreview() } else { stopPreview() }
  }

  private func configurePreview() {
    sessionQueue.async { [weak self] in
      guard let self, !self.configured else { return }
      self.captureSession.beginConfiguration()
      self.captureSession.sessionPreset = .photo
      defer { self.captureSession.commitConfiguration() }
      guard
        let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
        let input = try? AVCaptureDeviceInput(device: device),
        self.captureSession.canAddInput(input)
      else { return }
      self.captureSession.addInput(input)
      do {
        try device.lockForConfiguration()
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
        if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
        device.unlockForConfiguration()
      } catch {}
      self.configured = true
      if self.window != nil && !self.captureSession.isRunning { self.captureSession.startRunning() }
    }
  }

  private func startPreview() {
    sessionQueue.async { [weak self] in
      guard let self, self.configured, !self.captureSession.isRunning else { return }
      self.captureSession.startRunning()
    }
  }

  private func stopPreview() {
    sessionQueue.async { [weak self] in
      guard let self, self.captureSession.isRunning else { return }
      self.captureSession.stopRunning()
    }
  }

  @objc private func pausePreview() { stopPreview() }
  @objc private func resumePreview() { if window != nil { startPreview() } }
}

private final class RepairPilotLidarSession {
  let session = ARSession()
  var running = false
  private var frozenFrame: ARFrame?
  private var frozenDepth: ARDepthData?
  private let imageContext = CIContext(options: [.cacheIntermediates: false])

  func supported() -> Bool {
    ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
  }

  func start() throws {
    guard supported() else { throw RepairPilotLidarError.unsupported }
    NotificationCenter.default.post(name: .repairPilotPauseCameraPreview, object: nil)
    let configuration = ARWorldTrackingConfiguration()
    configuration.frameSemantics.insert(.sceneDepth)
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
      configuration.frameSemantics.insert(.smoothedSceneDepth)
    }
    configuration.worldAlignment = .gravity
    frozenFrame = nil
    frozenDepth = nil
    session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    running = true
  }

  func stop() {
    session.pause()
    running = false
    frozenFrame = nil
    frozenDepth = nil
    NotificationCenter.default.post(name: .repairPilotResumeCameraPreview, object: nil)
  }

  func depthFrame() throws -> (ARFrame, ARDepthData) {
    guard running else { throw RepairPilotLidarError.sessionNotRunning }
    for _ in 0..<50 {
      if let frame = session.currentFrame, let depth = frame.smoothedSceneDepth ?? frame.sceneDepth {
        return (frame, depth)
      }
      Thread.sleep(forTimeInterval: 0.05)
    }
    throw RepairPilotLidarError.depthUnavailable
  }

  private func imagePayload(frame: ARFrame, depth: ARDepthData) throws -> [String: Any] {
    // ARKit's capturedImage is delivered in the camera sensor's landscape coordinate
    // space. RepairPilot is portrait-only, so rotate the pixels before encoding.
    // This keeps the captured scan image aligned with what the user saw in preview.
    let rawImage = CIImage(cvPixelBuffer: frame.capturedImage)
    let portraitImage = rawImage.oriented(.right)
    guard let cgImage = imageContext.createCGImage(portraitImage, from: portraitImage.extent) else {
      throw RepairPilotLidarError.imageEncodingFailed
    }
    let uiImage = UIImage(cgImage: cgImage)
    guard let jpeg = uiImage.jpegData(compressionQuality: 0.9) else {
      throw RepairPilotLidarError.imageEncodingFailed
    }
    return [
      "image_base64": jpeg.base64EncodedString(),
      "mime_type": "image/jpeg",
      "width": CVPixelBufferGetHeight(frame.capturedImage),
      "height": CVPixelBufferGetWidth(frame.capturedImage),
      "depth_width": CVPixelBufferGetWidth(depth.depthMap),
      "depth_height": CVPixelBufferGetHeight(depth.depthMap)
    ]
  }

  func freezeSnapshot() throws -> [String: Any] {
    let (frame, depth) = try depthFrame()
    frozenFrame = frame
    frozenDepth = depth
    return try imagePayload(frame: frame, depth: depth)
  }

  private func median(_ values: [Float]) -> Float {
    let sorted = values.sorted()
    let middle = sorted.count / 2
    if sorted.count % 2 == 0 {
      return (sorted[middle - 1] + sorted[middle]) / 2.0
    }
    return sorted[middle]
  }

  private func percentile(_ values: [Float], _ fraction: Float) -> Float {
    let sorted = values.sorted()
    guard !sorted.isEmpty else { return 0 }
    let clamped = max(0, min(1, fraction))
    let index = min(sorted.count - 1, max(0, Int((Float(sorted.count - 1) * clamped).rounded())))
    return sorted[index]
  }

  private func medianDepth(
    buffer: CVPixelBuffer,
    confidence: CVPixelBuffer?,
    x: Int,
    y: Int,
    radius: Int = 2
  ) throws -> (Float, Float) {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    if let confidence { CVPixelBufferLockBaseAddress(confidence, .readOnly) }
    defer {
      CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
      if let confidence { CVPixelBufferUnlockBaseAddress(confidence, .readOnly) }
    }

    guard let base = CVPixelBufferGetBaseAddress(buffer) else { throw RepairPilotLidarError.invalidDepth }
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer) / MemoryLayout<Float32>.stride
    let values = base.assumingMemoryBound(to: Float32.self)

    var samples: [Float] = []
    var confidenceSamples: [Float] = []
    let confidenceBase = confidence.flatMap(CVPixelBufferGetBaseAddress)
    let confidenceStride = confidence.map { CVPixelBufferGetBytesPerRow($0) / MemoryLayout<UInt8>.stride } ?? 0

    let minX = max(0, x - radius)
    let maxX = min(width - 1, x + radius)
    let minY = max(0, y - radius)
    let maxY = min(height - 1, y + radius)
    let expectedSamples = max(1, (maxX - minX + 1) * (maxY - minY + 1))

    for py in minY...maxY {
      for px in minX...maxX {
        let z = values[py * stride + px]
        if z.isFinite && z > 0.02 && z < 5.0 {
          samples.append(z)
          if let confidenceBase {
            let confidenceValues = confidenceBase.assumingMemoryBound(to: UInt8.self)
            let level = confidenceValues[py * confidenceStride + px]
            confidenceSamples.append(min(1.0, Float(level) / 2.0))
          }
        }
      }
    }

    guard samples.count >= 5 else { throw RepairPilotLidarError.invalidDepth }
    let depth = median(samples)
    let deviations = samples.map { abs($0 - depth) }
    let mad = median(deviations)
    let relativeMad = mad / max(depth, 0.001)
    let consistencyConfidence = max(0.0, min(1.0, 1.0 - (relativeMad / 0.03)))
    let coverageConfidence = max(0.0, min(1.0, Float(samples.count) / Float(expectedSamples)))
    let arkitConfidence = confidenceSamples.isEmpty ? 0.5 : confidenceSamples.reduce(0, +) / Float(confidenceSamples.count)
    return (depth, min(arkitConfidence, min(consistencyConfidence, coverageConfidence)))
  }

  private func centeredObjectPointCloud(frame: ARFrame, depthData: ARDepthData) throws -> ([SIMD3<Float>], Float) {
    let depthMap = depthData.depthMap
    let confidenceMap = depthData.confidenceMap
    CVPixelBufferLockBaseAddress(depthMap, .readOnly)
    if let confidenceMap { CVPixelBufferLockBaseAddress(confidenceMap, .readOnly) }
    defer {
      CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
      if let confidenceMap { CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly) }
    }

    guard let base = CVPixelBufferGetBaseAddress(depthMap) else { throw RepairPilotLidarError.invalidDepth }
    let width = CVPixelBufferGetWidth(depthMap)
    let height = CVPixelBufferGetHeight(depthMap)
    let stride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.stride
    let values = base.assumingMemoryBound(to: Float32.self)
    let confidenceBase = confidenceMap.flatMap(CVPixelBufferGetBaseAddress)
    let confidenceStride = confidenceMap.map { CVPixelBufferGetBytesPerRow($0) / MemoryLayout<UInt8>.stride } ?? 0

    // Restrict discovery to the central viewfinder so nearby background objects do
    // not become part of the measured object. We intentionally do NOT require the
    // object to be a single connected depth blob; springs, clips, washers, and
    // other open geometry contain holes that expose background between their edges.
    let roiMinX = Int(Float(width) * 0.12)
    let roiMaxX = Int(Float(width) * 0.88)
    let roiMinY = Int(Float(height) * 0.12)
    let roiMaxY = Int(Float(height) * 0.88)
    let coreMinX = Int(Float(width) * 0.34)
    let coreMaxX = Int(Float(width) * 0.66)
    let coreMinY = Int(Float(height) * 0.34)
    let coreMaxY = Int(Float(height) * 0.66)

    var coreDepths: [Float] = []
    for y in coreMinY...coreMaxY {
      for x in coreMinX...coreMaxX {
        let z = values[y * stride + x]
        if z.isFinite && z > 0.05 && z < 3.0 { coreDepths.append(z) }
      }
    }
    guard coreDepths.count >= 24 else { throw RepairPilotLidarError.invalidDepth }

    // A foreground part typically occupies only a portion of the center window.
    // Using a low robust percentile finds the part even when the exact center ray
    // passes through a spring coil gap and lands on the background.
    let foregroundDepth = percentile(coreDepths, 0.22)
    let tolerance = max(Float(0.018), foregroundDepth * 0.055)

    let cameraWidth = Float(CVPixelBufferGetWidth(frame.capturedImage))
    let cameraHeight = Float(CVPixelBufferGetHeight(frame.capturedImage))
    var intrinsics = frame.camera.intrinsics
    intrinsics.columns.0.x *= Float(width) / cameraWidth
    intrinsics.columns.1.y *= Float(height) / cameraHeight
    intrinsics.columns.2.x *= Float(width) / cameraWidth
    intrinsics.columns.2.y *= Float(height) / cameraHeight
    let fx = intrinsics.columns.0.x
    let fy = intrinsics.columns.1.y
    let cx = intrinsics.columns.2.x
    let cy = intrinsics.columns.2.y
    guard fx > 0, fy > 0 else { throw RepairPilotLidarError.invalidDepth }

    var points: [SIMD3<Float>] = []
    var selectedDepths: [Float] = []
    var confidenceSamples: [Float] = []
    points.reserveCapacity(1500)

    // Depth maps are relatively low resolution; every qualifying pixel is useful.
    // A loose depth band joins separated coils/open geometry while excluding the
    // background behind them.
    for y in roiMinY...roiMaxY {
      for x in roiMinX...roiMaxX {
        let z = values[y * stride + x]
        guard z.isFinite && z > 0.05 && z < 3.0 && abs(z - foregroundDepth) <= tolerance else { continue }
        points.append(SIMD3<Float>(
          (Float(x) - cx) * z / fx,
          (Float(y) - cy) * z / fy,
          z
        ))
        selectedDepths.append(z)
        if let confidenceBase {
          let confidenceValues = confidenceBase.assumingMemoryBound(to: UInt8.self)
          let level = confidenceValues[y * confidenceStride + x]
          confidenceSamples.append(min(1.0, Float(level) / 2.0))
        }
      }
    }

    guard points.count >= 35 else { throw RepairPilotLidarError.invalidDepth }

    let medianSelectedDepth = median(selectedDepths)
    let depthMad = median(selectedDepths.map { abs($0 - medianSelectedDepth) })
    let depthConsistency = max(0.0, min(1.0, 1.0 - (depthMad / max(tolerance, 0.001))))
    let support = max(0.0, min(1.0, Float(points.count) / 180.0))
    let arkitConfidence = confidenceSamples.isEmpty ? 0.55 : confidenceSamples.reduce(0, +) / Float(confidenceSamples.count)
    let confidence = max(0.0, min(1.0, arkitConfidence * 0.70 + support * 0.18 + depthConsistency * 0.12))
    return (points, confidence)
  }

  private func principalExtentsMM(points: [SIMD3<Float>]) throws -> (long: Float, short: Float, depth: Float) {
    guard points.count >= 10 else { throw RepairPilotLidarError.invalidDepth }

    let meanX = points.reduce(Float(0)) { $0 + $1.x } / Float(points.count)
    let meanY = points.reduce(Float(0)) { $0 + $1.y } / Float(points.count)
    let meanZ = points.reduce(Float(0)) { $0 + $1.z } / Float(points.count)

    var xx: Float = 0
    var xy: Float = 0
    var yy: Float = 0
    for p in points {
      let dx = p.x - meanX
      let dy = p.y - meanY
      xx += dx * dx
      xy += dx * dy
      yy += dy * dy
    }
    xx /= Float(points.count)
    xy /= Float(points.count)
    yy /= Float(points.count)

    let trace = xx + yy
    let delta = sqrt(max(0, (xx - yy) * (xx - yy) + 4 * xy * xy))
    let lambda1 = max(0, (trace + delta) / 2)

    var major = SIMD2<Float>(1, 0)
    if abs(xy) > 0.0000001 {
      major = simd_normalize(SIMD2<Float>(lambda1 - yy, xy))
    } else if yy > xx {
      major = SIMD2<Float>(0, 1)
    }
    let minor = SIMD2<Float>(-major.y, major.x)

    var majorValues: [Float] = []
    var minorValues: [Float] = []
    var depthValues: [Float] = []
    majorValues.reserveCapacity(points.count)
    minorValues.reserveCapacity(points.count)
    depthValues.reserveCapacity(points.count)
    for p in points {
      let d = SIMD2<Float>(p.x - meanX, p.y - meanY)
      majorValues.append(simd_dot(d, major))
      minorValues.append(simd_dot(d, minor))
      depthValues.append(p.z)
    }

    // Robust 2nd-to-98th percentile extents ignore isolated depth speckles while
    // still preserving the ends of elongated objects such as compression springs.
    let longM = percentile(majorValues, 0.98) - percentile(majorValues, 0.02)
    let shortM = percentile(minorValues, 0.98) - percentile(minorValues, 0.02)
    let depthM = percentile(depthValues, 0.98) - percentile(depthValues, 0.02)
    let longMM = longM * 1000
    let shortMM = shortM * 1000
    let depthMM = depthM * 1000
    guard longMM.isFinite, shortMM.isFinite, longMM > 1, shortMM > 1 else { throw RepairPilotLidarError.invalidDepth }
    return (longMM, shortMM, max(0, depthMM))
  }

  func autoCaptureCenteredObject() throws -> [String: Any] {
    let (frame, depthData) = try depthFrame()
    frozenFrame = frame
    frozenDepth = depthData

    let (points, confidence) = try centeredObjectPointCloud(frame: frame, depthData: depthData)
    let extents = try principalExtentsMM(points: points)

    var payload = try imagePayload(frame: frame, depth: depthData)
    payload["confidence"] = Double(confidence)
    payload["measurements"] = [
      "long_axis_mm": Double(extents.long),
      "short_axis_mm": Double(extents.short),
      "depth_mm": Double(extents.depth),
      // Preserve generic width/height for compatibility. The JS layer maps the
      // principal axes to semantic fields after AI identifies the part type.
      "width_mm": Double(extents.short),
      "height_mm": Double(extents.long)
    ]
    payload["point_count"] = points.count
    return payload
  }

  func measure(startX: Double, startY: Double, endX: Double, endY: Double) throws -> [String: Any] {
    guard (0...1).contains(startX), (0...1).contains(startY), (0...1).contains(endX), (0...1).contains(endY) else { throw RepairPilotLidarError.invalidPoint }
    let pair: (ARFrame, ARDepthData)
    if let frame = frozenFrame, let depth = frozenDepth { pair = (frame, depth) } else { pair = try depthFrame() }
    let frame = pair.0, depthData = pair.1, depthMap = depthData.depthMap, confidenceMap = depthData.confidenceMap
    let depthWidth = CVPixelBufferGetWidth(depthMap), depthHeight = CVPixelBufferGetHeight(depthMap)
    let sx = min(depthWidth - 1, max(0, Int((startX * Double(depthWidth - 1)).rounded())))
    let sy = min(depthHeight - 1, max(0, Int((startY * Double(depthHeight - 1)).rounded())))
    let ex = min(depthWidth - 1, max(0, Int((endX * Double(depthWidth - 1)).rounded())))
    let ey = min(depthHeight - 1, max(0, Int((endY * Double(depthHeight - 1)).rounded())))
    let (startDepth, startConfidence) = try medianDepth(buffer: depthMap, confidence: confidenceMap, x: sx, y: sy)
    let (endDepth, endConfidence) = try medianDepth(buffer: depthMap, confidence: confidenceMap, x: ex, y: ey)
    let cameraWidth = Float(CVPixelBufferGetWidth(frame.capturedImage)), cameraHeight = Float(CVPixelBufferGetHeight(frame.capturedImage))
    var intrinsics = frame.camera.intrinsics
    intrinsics.columns.0.x *= Float(depthWidth) / cameraWidth; intrinsics.columns.1.y *= Float(depthHeight) / cameraHeight
    intrinsics.columns.2.x *= Float(depthWidth) / cameraWidth; intrinsics.columns.2.y *= Float(depthHeight) / cameraHeight
    let fx = intrinsics.columns.0.x, fy = intrinsics.columns.1.y, cx = intrinsics.columns.2.x, cy = intrinsics.columns.2.y
    guard fx > 0, fy > 0 else { throw RepairPilotLidarError.invalidDepth }
    let startPoint = SIMD3<Float>((Float(sx)-cx)*startDepth/fx,(Float(sy)-cy)*startDepth/fy,startDepth)
    let endPoint = SIMD3<Float>((Float(ex)-cx)*endDepth/fx,(Float(ey)-cy)*endDepth/fy,endDepth)
    let distanceMM = simd_distance(startPoint,endPoint)*1000.0
    guard distanceMM.isFinite && distanceMM > 0 else { throw RepairPilotLidarError.invalidDepth }
    return ["distance_mm":Double(distanceMM),"confidence":Double(min(startConfidence,endConfidence)),"depth_m":["start":Double(startDepth),"end":Double(endDepth)]]
  }
}

public class RepairPilotLidarModule: Module {
  private let lidar = RepairPilotLidarSession()

  public func definition() -> ModuleDefinition {
    Name("RepairPilotLidar")

    View(RepairPilotLidarPreviewView.self) {}

    AsyncFunction("isSupported") { () -> Bool in self.lidar.supported() }
    AsyncFunction("startSession") { () -> [String: Bool] in try self.lidar.start(); return ["running": true] }
    AsyncFunction("stopSession") { () -> Void in self.lidar.stop() }
    AsyncFunction("captureDepthSnapshot") { () -> [String: Any] in try self.lidar.freezeSnapshot() }
    AsyncFunction("autoCaptureCenteredObject") { () -> [String: Any] in try self.lidar.autoCaptureCenteredObject() }
    AsyncFunction("measureBetweenPoints") { (start: [String: Double], end: [String: Double]) -> [String: Any] in
      guard let startX=start["x"],let startY=start["y"],let endX=end["x"],let endY=end["y"] else { throw RepairPilotLidarError.invalidPoint }
      return try self.lidar.measure(startX:startX,startY:startY,endX:endX,endY:endY)
    }
  }
}
