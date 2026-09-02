import ExpoModulesCore
import ARKit
import CoreVideo
import CoreImage
import UIKit
import simd

private enum RepairPilotARError: Error {
  case unsupported
  case sessionNotRunning
  case frameUnavailable
  case depthUnavailable
  case invalidPoint
  case invalidDepth
  case anchorNotFound
  case imageEncodingFailed
}

private final class RepairPilotARSession {
  let session = ARSession()
  var running = false
  var anchors: [UUID: ARAnchor] = [:]
  private var frozenFrame: ARFrame?
  private var frozenDepth: ARDepthData?
  private let imageContext = CIContext(options: [.cacheIntermediates: false])

  func supported() -> Bool {
    ARWorldTrackingConfiguration.isSupported
  }

  func depthSupported() -> Bool {
    ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
  }

  func start() throws {
    guard supported() else { throw RepairPilotARError.unsupported }
    let configuration = ARWorldTrackingConfiguration()
    configuration.worldAlignment = .gravity
    configuration.planeDetection = [.horizontal, .vertical]
    if depthSupported() {
      configuration.frameSemantics.insert(.sceneDepth)
    }
    frozenFrame = nil
    frozenDepth = nil
    session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    anchors.removeAll()
    running = true
  }

  func stop() {
    session.pause()
    running = false
    anchors.removeAll()
    frozenFrame = nil
    frozenDepth = nil
  }

  private func currentFrame() throws -> ARFrame {
    guard running else { throw RepairPilotARError.sessionNotRunning }
    guard let frame = session.currentFrame else { throw RepairPilotARError.frameUnavailable }
    return frame
  }

  private func encodedSnapshot(frame: ARFrame) throws -> [String: Any] {
    let image = CIImage(cvPixelBuffer: frame.capturedImage)
    guard let cgImage = imageContext.createCGImage(image, from: image.extent) else {
      throw RepairPilotARError.imageEncodingFailed
    }
    let uiImage = UIImage(cgImage: cgImage)
    guard let jpeg = uiImage.jpegData(compressionQuality: 0.76) else {
      throw RepairPilotARError.imageEncodingFailed
    }
    return [
      "image_base64": jpeg.base64EncodedString(),
      "mime_type": "image/jpeg",
      "width": CVPixelBufferGetWidth(frame.capturedImage),
      "height": CVPixelBufferGetHeight(frame.capturedImage)
    ]
  }

  func captureTargetSnapshot() throws -> [String: Any] {
    guard depthSupported() else { throw RepairPilotARError.depthUnavailable }
    for _ in 0..<24 {
      if let frame = session.currentFrame, let depth = frame.sceneDepth {
        frozenFrame = frame
        frozenDepth = depth
        var payload = try encodedSnapshot(frame: frame)
        payload["depth_available"] = true
        payload["depth_width"] = CVPixelBufferGetWidth(depth.depthMap)
        payload["depth_height"] = CVPixelBufferGetHeight(depth.depthMap)
        return payload
      }
      Thread.sleep(forTimeInterval: 0.05)
    }
    throw RepairPilotARError.depthUnavailable
  }

  func captureLiveSnapshot() throws -> [String: Any] {
    try encodedSnapshot(frame: currentFrame())
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

    guard let base = CVPixelBufferGetBaseAddress(buffer) else { throw RepairPilotARError.invalidDepth }
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer) / MemoryLayout<Float32>.stride
    let values = base.assumingMemoryBound(to: Float32.self)

    var samples: [Float] = []
    var confidenceSamples: [Float] = []
    let confidenceBase = confidence.flatMap(CVPixelBufferGetBaseAddress)
    let confidenceStride = confidence.map { CVPixelBufferGetBytesPerRow($0) / MemoryLayout<UInt8>.stride } ?? 0

    for py in max(0, y - radius)...min(height - 1, y + radius) {
      for px in max(0, x - radius)...min(width - 1, x + radius) {
        let z = values[py * stride + px]
        if z.isFinite && z > 0.02 && z < 5.0 {
          samples.append(z)
          if let confidenceBase {
            let levels = confidenceBase.assumingMemoryBound(to: UInt8.self)
            confidenceSamples.append(min(1.0, Float(levels[py * confidenceStride + px]) / 2.0))
          }
        }
      }
    }

    guard samples.count >= 3 else { throw RepairPilotARError.invalidDepth }
    samples.sort()
    let depth = samples[samples.count / 2]
    let confidenceValue = confidenceSamples.isEmpty ? 0.5 : confidenceSamples.reduce(0, +) / Float(confidenceSamples.count)
    return (depth, confidenceValue)
  }

  private func worldPoint(frame: ARFrame, depthData: ARDepthData, x: Double, y: Double) throws -> (SIMD4<Float>, Float) {
    guard (0...1).contains(x), (0...1).contains(y) else { throw RepairPilotARError.invalidPoint }
    let depthMap = depthData.depthMap
    let confidenceMap = depthData.confidenceMap
    let depthWidth = CVPixelBufferGetWidth(depthMap)
    let depthHeight = CVPixelBufferGetHeight(depthMap)
    let px = min(depthWidth - 1, max(0, Int((x * Double(depthWidth - 1)).rounded())))
    let py = min(depthHeight - 1, max(0, Int((y * Double(depthHeight - 1)).rounded())))
    let (depth, confidence) = try medianDepth(buffer: depthMap, confidence: confidenceMap, x: px, y: py)

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
    guard fx > 0, fy > 0 else { throw RepairPilotARError.frameUnavailable }

    let cameraPoint = SIMD4<Float>(
      (Float(px) - cx) * depth / fx,
      -(Float(py) - cy) * depth / fy,
      -depth,
      1.0
    )
    return (frame.camera.transform * cameraPoint, confidence)
  }

  private func addAnchor(worldPoint: SIMD4<Float>, confidence: Float) -> [String: Any] {
    var transform = matrix_identity_float4x4
    transform.columns.3 = SIMD4<Float>(worldPoint.x, worldPoint.y, worldPoint.z, 1.0)
    let anchor = ARAnchor(transform: transform)
    session.add(anchor: anchor)
    anchors[anchor.identifier] = anchor
    return [
      "id": anchor.identifier.uuidString,
      "confidence": Double(confidence),
      "position": ["x": Double(worldPoint.x), "y": Double(worldPoint.y), "z": Double(worldPoint.z)]
    ]
  }

  func anchorAtFrozenDepthPoint(x: Double, y: Double) throws -> [String: Any] {
    guard let frame = frozenFrame, let depth = frozenDepth else { throw RepairPilotARError.depthUnavailable }
    let (point, confidence) = try worldPoint(frame: frame, depthData: depth, x: x, y: y)
    guard confidence >= 0.5 else { throw RepairPilotARError.invalidDepth }
    return addAnchor(worldPoint: point, confidence: confidence)
  }

  func anchorAtImagePoint(x: Double, y: Double, depthMeters: Double) throws -> [String: Any] {
    guard (0...1).contains(x), (0...1).contains(y) else { throw RepairPilotARError.invalidPoint }
    guard depthMeters.isFinite, depthMeters > 0.02, depthMeters < 5.0 else { throw RepairPilotARError.invalidDepth }

    let frame = try currentFrame()
    let imageWidth = Double(CVPixelBufferGetWidth(frame.capturedImage))
    let imageHeight = Double(CVPixelBufferGetHeight(frame.capturedImage))
    let u = Float(x * imageWidth)
    let v = Float(y * imageHeight)
    let intrinsics = frame.camera.intrinsics
    let fx = intrinsics.columns.0.x
    let fy = intrinsics.columns.1.y
    let cx = intrinsics.columns.2.x
    let cy = intrinsics.columns.2.y
    guard fx > 0, fy > 0 else { throw RepairPilotARError.frameUnavailable }

    let depth = Float(depthMeters)
    let cameraPoint = SIMD4<Float>((u - cx) * depth / fx, -(v - cy) * depth / fy, -depth, 1.0)
    return addAnchor(worldPoint: frame.camera.transform * cameraPoint, confidence: 1.0)
  }

  func projectAnchor(id: String, viewportWidth: Double, viewportHeight: Double) throws -> [String: Any] {
    guard viewportWidth > 0, viewportHeight > 0 else { throw RepairPilotARError.invalidPoint }
    guard let uuid = UUID(uuidString: id), let anchor = anchors[uuid] else { throw RepairPilotARError.anchorNotFound }
    let frame = try currentFrame()
    let world = SIMD3<Float>(anchor.transform.columns.3.x, anchor.transform.columns.3.y, anchor.transform.columns.3.z)
    let size = CGSize(width: viewportWidth, height: viewportHeight)
    let projected = frame.camera.projectPoint(world, orientation: .portrait, viewportSize: size)
    let inverseCamera = simd_inverse(frame.camera.transform)
    let cameraPoint = inverseCamera * SIMD4<Float>(world.x, world.y, world.z, 1.0)
    let depth = Double(-cameraPoint.z)
    let visible = depth > 0 && projected.x.isFinite && projected.y.isFinite && projected.x >= 0 && projected.y >= 0 && projected.x <= size.width && projected.y <= size.height

    return [
      "visible": visible,
      "x": viewportWidth > 0 ? Double(projected.x / size.width) : 0,
      "y": viewportHeight > 0 ? Double(projected.y / size.height) : 0,
      "depth": depth
    ]
  }

  func removeAnchor(id: String) throws {
    guard let uuid = UUID(uuidString: id), let anchor = anchors.removeValue(forKey: uuid) else { throw RepairPilotARError.anchorNotFound }
    session.remove(anchor: anchor)
  }

  func clearAnchors() {
    for anchor in anchors.values { session.remove(anchor: anchor) }
    anchors.removeAll()
  }
}

public class RepairPilotARModule: Module {
  private let ar = RepairPilotARSession()

  public func definition() -> ModuleDefinition {
    Name("RepairPilotAR")

    AsyncFunction("isSupported") { () -> Bool in self.ar.supported() }
    AsyncFunction("isDepthSupported") { () -> Bool in self.ar.depthSupported() }

    AsyncFunction("startSession") { () -> [String: Bool] in
      try self.ar.start()
      return ["running": true, "depth": self.ar.depthSupported()]
    }

    AsyncFunction("stopSession") { () -> Void in self.ar.stop() }
    AsyncFunction("captureTargetSnapshot") { () -> [String: Any] in try self.ar.captureTargetSnapshot() }
    AsyncFunction("captureLiveSnapshot") { () -> [String: Any] in try self.ar.captureLiveSnapshot() }

    AsyncFunction("anchorAtFrozenDepthPoint") { (point: [String: Double]) -> [String: Any] in
      guard let x = point["x"], let y = point["y"] else { throw RepairPilotARError.invalidPoint }
      return try self.ar.anchorAtFrozenDepthPoint(x: x, y: y)
    }

    AsyncFunction("anchorAtImagePoint") { (point: [String: Double], depthMeters: Double) -> [String: Any] in
      guard let x = point["x"], let y = point["y"] else { throw RepairPilotARError.invalidPoint }
      return try self.ar.anchorAtImagePoint(x: x, y: y, depthMeters: depthMeters)
    }

    AsyncFunction("projectAnchor") { (id: String, viewport: [String: Double]) -> [String: Any] in
      guard let width = viewport["width"], let height = viewport["height"] else { throw RepairPilotARError.invalidPoint }
      return try self.ar.projectAnchor(id: id, viewportWidth: width, viewportHeight: height)
    }

    AsyncFunction("removeAnchor") { (id: String) -> Void in try self.ar.removeAnchor(id: id) }
    AsyncFunction("clearAnchors") { () -> Void in self.ar.clearAnchors() }
  }
}
