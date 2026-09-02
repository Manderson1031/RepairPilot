import ExpoModulesCore
import ARKit
import UIKit
import simd

private enum RepairPilotARError: Error {
  case unsupported
  case sessionNotRunning
  case frameUnavailable
  case invalidPoint
  case invalidDepth
  case anchorNotFound
}

private final class RepairPilotARSession {
  let session = ARSession()
  var running = false
  var anchors: [UUID: ARAnchor] = [:]

  func supported() -> Bool {
    ARWorldTrackingConfiguration.isSupported
  }

  func start() throws {
    guard supported() else { throw RepairPilotARError.unsupported }
    let configuration = ARWorldTrackingConfiguration()
    configuration.worldAlignment = .gravity
    configuration.planeDetection = [.horizontal, .vertical]
    session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    anchors.removeAll()
    running = true
  }

  func stop() {
    session.pause()
    running = false
    anchors.removeAll()
  }

  private func currentFrame() throws -> ARFrame {
    guard running else { throw RepairPilotARError.sessionNotRunning }
    guard let frame = session.currentFrame else { throw RepairPilotARError.frameUnavailable }
    return frame
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
    let cameraPoint = SIMD4<Float>(
      (u - cx) * depth / fx,
      -(v - cy) * depth / fy,
      -depth,
      1.0
    )
    let worldPoint = frame.camera.transform * cameraPoint
    var transform = matrix_identity_float4x4
    transform.columns.3 = SIMD4<Float>(worldPoint.x, worldPoint.y, worldPoint.z, 1.0)

    let anchor = ARAnchor(transform: transform)
    session.add(anchor: anchor)
    anchors[anchor.identifier] = anchor

    return [
      "id": anchor.identifier.uuidString,
      "position": [
        "x": Double(worldPoint.x),
        "y": Double(worldPoint.y),
        "z": Double(worldPoint.z)
      ]
    ]
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

    AsyncFunction("isSupported") { () -> Bool in
      self.ar.supported()
    }

    AsyncFunction("startSession") { () -> [String: Bool] in
      try self.ar.start()
      return ["running": true]
    }

    AsyncFunction("stopSession") { () -> Void in
      self.ar.stop()
    }

    AsyncFunction("anchorAtImagePoint") { (point: [String: Double], depthMeters: Double) -> [String: Any] in
      guard let x = point["x"], let y = point["y"] else { throw RepairPilotARError.invalidPoint }
      return try self.ar.anchorAtImagePoint(x: x, y: y, depthMeters: depthMeters)
    }

    AsyncFunction("projectAnchor") { (id: String, viewport: [String: Double]) -> [String: Any] in
      guard let width = viewport["width"], let height = viewport["height"] else { throw RepairPilotARError.invalidPoint }
      return try self.ar.projectAnchor(id: id, viewportWidth: width, viewportHeight: height)
    }

    AsyncFunction("removeAnchor") { (id: String) -> Void in
      try self.ar.removeAnchor(id: id)
    }

    AsyncFunction("clearAnchors") { () -> Void in
      self.ar.clearAnchors()
    }
  }
}
