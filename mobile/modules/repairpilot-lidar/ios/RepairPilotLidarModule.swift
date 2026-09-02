import ExpoModulesCore
import ARKit
import CoreVideo
import simd

private enum RepairPilotLidarError: Error {
  case unsupported
  case sessionNotRunning
  case depthUnavailable
  case invalidPoint
  case invalidDepth
}

private final class RepairPilotLidarSession {
  let session = ARSession()
  var running = false

  func supported() -> Bool {
    ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
  }

  func start() throws {
    guard supported() else { throw RepairPilotLidarError.unsupported }
    let configuration = ARWorldTrackingConfiguration()
    configuration.frameSemantics.insert(.sceneDepth)
    configuration.worldAlignment = .gravity
    session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    running = true
  }

  func stop() {
    session.pause()
    running = false
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

    for py in max(0, y - radius)...min(height - 1, y + radius) {
      for px in max(0, x - radius)...min(width - 1, x + radius) {
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

    guard samples.count >= 3 else { throw RepairPilotLidarError.invalidDepth }
    samples.sort()
    let depth = samples[samples.count / 2]
    let confidenceValue = confidenceSamples.isEmpty ? 0.5 : confidenceSamples.reduce(0, +) / Float(confidenceSamples.count)
    return (depth, confidenceValue)
  }

  func measure(startX: Double, startY: Double, endX: Double, endY: Double) throws -> [String: Any] {
    guard (0...1).contains(startX), (0...1).contains(startY), (0...1).contains(endX), (0...1).contains(endY) else {
      throw RepairPilotLidarError.invalidPoint
    }

    let (frame, depthData) = try depthFrame()
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
      "depth_m": [
        "start": Double(startDepth),
        "end": Double(endDepth)
      ]
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

    AsyncFunction("measureBetweenPoints") { (start: [String: Double], end: [String: Double]) -> [String: Any] in
      guard let startX = start["x"], let startY = start["y"], let endX = end["x"], let endY = end["y"] else {
        throw RepairPilotLidarError.invalidPoint
      }
      return try self.lidar.measure(startX: startX, startY: startY, endX: endX, endY: endY)
    }
  }
}
