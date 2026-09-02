import ExpoModulesCore
import ARKit
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
    let configuration = ARWorldTrackingConfiguration()
    configuration.frameSemantics.insert(.sceneDepth)
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
  }

  func depthFrame() throws -> (ARFrame, ARDepthData) {
    guard running else { throw RepairPilotLidarError.sessionNotRunning }
    for _ in 0..<24 {
      if let frame = session.currentFrame, let depth = frame.sceneDepth {
        return (frame, depth)
      }
      Thread.sleep(forTimeInterval: 0.05)
    }
    throw RepairPilotLidarError.depthUnavailable
  }

  func freezeSnapshot() throws -> [String: Any] {
    let (frame, depth) = try depthFrame()
    frozenFrame = frame
    frozenDepth = depth

    let image = CIImage(cvPixelBuffer: frame.capturedImage)
    guard let cgImage = imageContext.createCGImage(image, from: image.extent) else {
      throw RepairPilotLidarError.imageEncodingFailed
    }
    let uiImage = UIImage(cgImage: cgImage)
    guard let jpeg = uiImage.jpegData(compressionQuality: 0.82) else {
      throw RepairPilotLidarError.imageEncodingFailed
    }

    return [
      "image_base64": jpeg.base64EncodedString(),
      "mime_type": "image/jpeg",
      "width": CVPixelBufferGetWidth(frame.capturedImage),
      "height": CVPixelBufferGetHeight(frame.capturedImage),
      "depth_width": CVPixelBufferGetWidth(depth.depthMap),
      "depth_height": CVPixelBufferGetHeight(depth.depthMap)
    ]
  }

  private func median(_ values: [Float]) -> Float {
    let sorted = values.sorted()
    let middle = sorted.count / 2
    if sorted.count % 2 == 0 {
      return (sorted[middle - 1] + sorted[middle]) / 2.0
    }
    return sorted[middle]
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

    // Penalize endpoint windows that straddle an object edge, contain depth holes,
    // or show locally inconsistent geometry. ARKit confidence alone can still be
    // high on mixed foreground/background samples, which is unsafe for exact sizing.
    let deviations = samples.map { abs($0 - depth) }
    let mad = median(deviations)
    let relativeMad = mad / max(depth, 0.001)
    let consistencyConfidence = max(0.0, min(1.0, 1.0 - (relativeMad / 0.025)))
    let coverageConfidence = max(0.0, min(1.0, Float(samples.count) / Float(expectedSamples)))
    let arkitConfidence = confidenceSamples.isEmpty ? 0.5 : confidenceSamples.reduce(0, +) / Float(confidenceSamples.count)
    let confidenceValue = min(arkitConfidence, consistencyConfidence, coverageConfidence)

    return (depth, confidenceValue)
  }

  func measure(startX: Double, startY: Double, endX: Double, endY: Double) throws -> [String: Any] {
    guard (0...1).contains(startX), (0...1).contains(startY), (0...1).contains(endX), (0...1).contains(endY) else {
      throw RepairPilotLidarError.invalidPoint
    }

    let pair: (ARFrame, ARDepthData)
    if let frame = frozenFrame, let depth = frozenDepth {
      pair = (frame, depth)
    } else {
      pair = try depthFrame()
    }
    let frame = pair.0
    let depthData = pair.1
    let depthMap = depthData.depthMap
    let confidenceMap = depthData.confidenceMap
    let depthWidth = CVPixelBufferGetWidth(depthMap)
    let depthHeight = CVPixelBufferGetHeight(depthMap)

    let sx = min(depthWidth - 1, max(0, Int((startX * Double(depthWidth - 1)).rounded())))
    let sy = min(depthHeight - 1, max(0, Int((startY * Double(depthHeight - 1)).rounded())))
    let ex = min(depthWidth - 1, max(0, Int((endX * Double(depthWidth - 1)).rounded())))
    let ey = min(depthHeight - 1, max(0, Int((endY * Double(depthHeight - 1)).rounded())))

    let (startDepth, startConfidence) = try medianDepth(buffer: depthMap, confidence: confidenceMap, x: sx, y: sy)
    let (endDepth, endConfidence) = try medianDepth(buffer: depthMap, confidence: confidenceMap, x: ex, y: ey)

    let cameraWidth = Float(CVPixelBufferGetWidth(frame.capturedImage))
    let cameraHeight = Float(CVPixelBufferGetHeight(frame.capturedImage))
    var intrinsics = frame.camera.intrinsics
    let scaleX = Float(depthWidth) / cameraWidth
    let scaleY = Float(depthHeight) / cameraHeight
    intrinsics.columns.0.x *= scaleX
    intrinsics.columns.1.y *= scaleY
    intrinsics.columns.2.x *= scaleX
    intrinsics.columns.2.y *= scaleY

    let fx = intrinsics.columns.0.x
    let fy = intrinsics.columns.1.y
    let cx = intrinsics.columns.2.x
    let cy = intrinsics.columns.2.y
    guard fx > 0, fy > 0 else { throw RepairPilotLidarError.invalidDepth }

    let startPoint = SIMD3<Float>(
      (Float(sx) - cx) * startDepth / fx,
      (Float(sy) - cy) * startDepth / fy,
      startDepth
    )
    let endPoint = SIMD3<Float>(
      (Float(ex) - cx) * endDepth / fx,
      (Float(ey) - cy) * endDepth / fy,
      endDepth
    )

    let distanceMM = simd_distance(startPoint, endPoint) * 1000.0
    let confidence = min(startConfidence, endConfidence)
    guard distanceMM.isFinite && distanceMM > 0 else { throw RepairPilotLidarError.invalidDepth }

    return [
      "distance_mm": Double(distanceMM),
      "confidence": Double(confidence),
      "depth_m": ["start": Double(startDepth), "end": Double(endDepth)]
    ]
  }
}

public class RepairPilotLidarModule: Module {
  private let lidar = RepairPilotLidarSession()

  public func definition() -> ModuleDefinition {
    Name("RepairPilotLidar")

    AsyncFunction("isSupported") { () -> Bool in
      self.lidar.supported()
    }

    AsyncFunction("startSession") { () -> [String: Bool] in
      try self.lidar.start()
      return ["running": true]
    }

    AsyncFunction("stopSession") { () -> Void in
      self.lidar.stop()
    }

    AsyncFunction("captureDepthSnapshot") { () -> [String: Any] in
      try self.lidar.freezeSnapshot()
    }

    AsyncFunction("measureBetweenPoints") { (start: [String: Double], end: [String: Double]) -> [String: Any] in
      guard let startX = start["x"], let startY = start["y"], let endX = end["x"], let endY = end["y"] else {
        throw RepairPilotLidarError.invalidPoint
      }
      return try self.lidar.measure(startX: startX, startY: startY, endX: endX, endY: endY)
    }
  }
}
