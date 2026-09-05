import ExpoModulesCore
import ARKit
import SceneKit
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

  func supported() -> Bool { ARWorldTrackingConfiguration.isSupported }
  func depthSupported() -> Bool { ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) }

  func start() throws {
    guard supported() else { throw RepairPilotARError.unsupported }
    let configuration = ARWorldTrackingConfiguration()
    configuration.worldAlignment = .gravity
    configuration.planeDetection = [.horizontal, .vertical]
    if depthSupported() { configuration.frameSemantics.insert(.sceneDepth) }
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
      configuration.frameSemantics.insert(.smoothedSceneDepth)
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
    let raw = CIImage(cvPixelBuffer: frame.capturedImage)
    let portrait = raw.oriented(.right)
    guard let cgImage = imageContext.createCGImage(portrait, from: portrait.extent) else {
      throw RepairPilotARError.imageEncodingFailed
    }
    let uiImage = UIImage(cgImage: cgImage)
    guard let jpeg = uiImage.jpegData(compressionQuality: 0.82) else {
      throw RepairPilotARError.imageEncodingFailed
    }
    return [
      "image_base64": jpeg.base64EncodedString(),
      "mime_type": "image/jpeg",
      "width": CVPixelBufferGetHeight(frame.capturedImage),
      "height": CVPixelBufferGetWidth(frame.capturedImage)
    ]
  }

  func captureTargetSnapshot() throws -> [String: Any] {
    guard depthSupported() else { throw RepairPilotARError.depthUnavailable }
    for _ in 0..<30 {
      if let frame = session.currentFrame, let depth = frame.smoothedSceneDepth ?? frame.sceneDepth {
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

  func captureLiveSnapshot() throws -> [String: Any] { try encodedSnapshot(frame: currentFrame()) }

  private func medianDepth(buffer: CVPixelBuffer, confidence: CVPixelBuffer?, x: Int, y: Int, radius: Int = 2) throws -> (Float, Float) {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    if let confidence { CVPixelBufferLockBaseAddress(confidence, .readOnly) }
    defer {
      CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
      if let confidence { CVPixelBufferUnlockBaseAddress(confidence, .readOnly) }
    }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { throw RepairPilotARError.invalidDepth }
    let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer) / MemoryLayout<Float32>.stride
    let values = base.assumingMemoryBound(to: Float32.self)
    var samples:[Float]=[], confidenceSamples:[Float]=[]
    let confidenceBase = confidence.flatMap(CVPixelBufferGetBaseAddress)
    let confidenceStride = confidence.map { CVPixelBufferGetBytesPerRow($0) / MemoryLayout<UInt8>.stride } ?? 0
    for py in max(0,y-radius)...min(height-1,y+radius) {
      for px in max(0,x-radius)...min(width-1,x+radius) {
        let z=values[py*stride+px]
        if z.isFinite && z>0.02 && z<5.0 {
          samples.append(z)
          if let confidenceBase {
            let levels=confidenceBase.assumingMemoryBound(to: UInt8.self)
            confidenceSamples.append(min(1.0,Float(levels[py*confidenceStride+px])/2.0))
          }
        }
      }
    }
    guard samples.count>=3 else { throw RepairPilotARError.invalidDepth }
    samples.sort()
    let depth=samples[samples.count/2]
    let confidenceValue=confidenceSamples.isEmpty ? 0.5 : confidenceSamples.reduce(0,+)/Float(confidenceSamples.count)
    return (depth,confidenceValue)
  }

  private func depthPixelForPortraitPoint(frame: ARFrame, depthWidth: Int, depthHeight: Int, x: Double, y: Double) -> (Int,Int) {
    let viewPoint=CGPoint(x:max(0,min(1,x)),y:max(0,min(1,y)))
    let viewport=CGSize(width:CGFloat(depthHeight),height:CGFloat(depthWidth))
    let displayTransform=frame.displayTransform(for:.portrait,viewportSize:viewport)
    let imagePoint=viewPoint.applying(displayTransform.inverted())
    let px=min(depthWidth-1,max(0,Int((imagePoint.x*CGFloat(depthWidth-1)).rounded())))
    let py=min(depthHeight-1,max(0,Int((imagePoint.y*CGFloat(depthHeight-1)).rounded())))
    return (px,py)
  }

  private func worldPoint(frame: ARFrame, depthData: ARDepthData, x: Double, y: Double) throws -> (SIMD4<Float>, Float) {
    guard (0...1).contains(x),(0...1).contains(y) else { throw RepairPilotARError.invalidPoint }
    let depthMap=depthData.depthMap, confidenceMap=depthData.confidenceMap
    let depthWidth=CVPixelBufferGetWidth(depthMap), depthHeight=CVPixelBufferGetHeight(depthMap)
    let (px,py)=depthPixelForPortraitPoint(frame:frame,depthWidth:depthWidth,depthHeight:depthHeight,x:x,y:y)
    let (depth,confidence)=try medianDepth(buffer:depthMap,confidence:confidenceMap,x:px,y:py)
    let cameraWidth=Float(CVPixelBufferGetWidth(frame.capturedImage)), cameraHeight=Float(CVPixelBufferGetHeight(frame.capturedImage))
    var intrinsics=frame.camera.intrinsics
    intrinsics.columns.0.x *= Float(depthWidth)/cameraWidth
    intrinsics.columns.1.y *= Float(depthHeight)/cameraHeight
    intrinsics.columns.2.x *= Float(depthWidth)/cameraWidth
    intrinsics.columns.2.y *= Float(depthHeight)/cameraHeight
    let fx=intrinsics.columns.0.x, fy=intrinsics.columns.1.y, cx=intrinsics.columns.2.x, cy=intrinsics.columns.2.y
    guard fx>0,fy>0 else { throw RepairPilotARError.frameUnavailable }
    let cameraPoint=SIMD4<Float>((Float(px)-cx)*depth/fx,-(Float(py)-cy)*depth/fy,-depth,1)
    return (frame.camera.transform*cameraPoint,confidence)
  }

  private func addAnchor(worldPoint: SIMD4<Float>, confidence: Float) -> [String: Any] {
    var transform=matrix_identity_float4x4
    transform.columns.3=SIMD4<Float>(worldPoint.x,worldPoint.y,worldPoint.z,1)
    let anchor=ARAnchor(transform:transform)
    session.add(anchor:anchor)
    anchors[anchor.identifier]=anchor
    return ["id":anchor.identifier.uuidString,"confidence":Double(confidence),"position":["x":Double(worldPoint.x),"y":Double(worldPoint.y),"z":Double(worldPoint.z)]]
  }

  func anchorAtFrozenDepthPoint(x: Double, y: Double) throws -> [String: Any] {
    guard let frame=frozenFrame, let depth=frozenDepth else { throw RepairPilotARError.depthUnavailable }
    let (point,confidence)=try worldPoint(frame:frame,depthData:depth,x:x,y:y)
    guard confidence>=0.35 else { throw RepairPilotARError.invalidDepth }
    return addAnchor(worldPoint:point,confidence:confidence)
  }

  func anchorAtImagePoint(x: Double, y: Double, depthMeters: Double) throws -> [String: Any] {
    guard (0...1).contains(x),(0...1).contains(y),depthMeters.isFinite,depthMeters>0.02,depthMeters<5.0 else { throw RepairPilotARError.invalidPoint }
    let frame=try currentFrame()
    let imageWidth=CVPixelBufferGetWidth(frame.capturedImage), imageHeight=CVPixelBufferGetHeight(frame.capturedImage)
    let (px,py)=depthPixelForPortraitPoint(frame:frame,depthWidth:imageWidth,depthHeight:imageHeight,x:x,y:y)
    let intrinsics=frame.camera.intrinsics
    let fx=intrinsics.columns.0.x,fy=intrinsics.columns.1.y,cx=intrinsics.columns.2.x,cy=intrinsics.columns.2.y
    guard fx>0,fy>0 else { throw RepairPilotARError.frameUnavailable }
    let depth=Float(depthMeters)
    let cameraPoint=SIMD4<Float>((Float(px)-cx)*depth/fx,-(Float(py)-cy)*depth/fy,-depth,1)
    return addAnchor(worldPoint:frame.camera.transform*cameraPoint,confidence:1)
  }

  func projectAnchor(id: String, viewportWidth: Double, viewportHeight: Double) throws -> [String: Any] {
    guard viewportWidth>0,viewportHeight>0 else { throw RepairPilotARError.invalidPoint }
    guard let uuid=UUID(uuidString:id),let anchor=anchors[uuid] else { throw RepairPilotARError.anchorNotFound }
    let frame=try currentFrame()
    let world=SIMD3<Float>(anchor.transform.columns.3.x,anchor.transform.columns.3.y,anchor.transform.columns.3.z)
    let size=CGSize(width:viewportWidth,height:viewportHeight)
    let projected=frame.camera.projectPoint(world,orientation:.portrait,viewportSize:size)
    let inverseCamera=simd_inverse(frame.camera.transform)
    let cameraPoint=inverseCamera*SIMD4<Float>(world.x,world.y,world.z,1)
    let depth=Double(-cameraPoint.z)
    let visible=depth>0 && projected.x.isFinite && projected.y.isFinite && projected.x>=0 && projected.y>=0 && projected.x<=size.width && projected.y<=size.height
    return ["visible":visible,"x":Double(projected.x/size.width),"y":Double(projected.y/size.height),"depth":depth]
  }

  func removeAnchor(id:String) throws {
    guard let uuid=UUID(uuidString:id),let anchor=anchors.removeValue(forKey:uuid) else { throw RepairPilotARError.anchorNotFound }
    session.remove(anchor:anchor)
  }
  func clearAnchors(){ for anchor in anchors.values { session.remove(anchor:anchor) }; anchors.removeAll() }
}

private let sharedAR = RepairPilotARSession()

final class RepairPilotARPreviewView: ExpoView {
  private let sceneView = ARSCNView(frame:.zero)
  required init(appContext: AppContext? = nil) {
    super.init(appContext:appContext)
    backgroundColor = .black
    sceneView.scene = SCNScene()
    sceneView.session = sharedAR.session
    sceneView.automaticallyUpdatesLighting = true
    sceneView.contentMode = .scaleAspectFill
    sceneView.backgroundColor = .black
    addSubview(sceneView)
  }
  override func layoutSubviews() {
    super.layoutSubviews()
    sceneView.frame = bounds
  }
}

public class RepairPilotARModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RepairPilotAR")
    View(RepairPilotARPreviewView.self) {}
    AsyncFunction("isSupported") { () -> Bool in sharedAR.supported() }
    AsyncFunction("isDepthSupported") { () -> Bool in sharedAR.depthSupported() }
    AsyncFunction("startSession") { () -> [String: Bool] in try sharedAR.start(); return ["running":true,"depth":sharedAR.depthSupported()] }
    AsyncFunction("stopSession") { () -> Void in sharedAR.stop() }
    AsyncFunction("captureTargetSnapshot") { () -> [String: Any] in try sharedAR.captureTargetSnapshot() }
    AsyncFunction("captureLiveSnapshot") { () -> [String: Any] in try sharedAR.captureLiveSnapshot() }
    AsyncFunction("anchorAtFrozenDepthPoint") { (point:[String:Double]) -> [String:Any] in
      guard let x=point["x"],let y=point["y"] else { throw RepairPilotARError.invalidPoint }
      return try sharedAR.anchorAtFrozenDepthPoint(x:x,y:y)
    }
    AsyncFunction("anchorAtImagePoint") { (point:[String:Double],depthMeters:Double) -> [String:Any] in
      guard let x=point["x"],let y=point["y"] else { throw RepairPilotARError.invalidPoint }
      return try sharedAR.anchorAtImagePoint(x:x,y:y,depthMeters:depthMeters)
    }
    AsyncFunction("projectAnchor") { (id:String,viewport:[String:Double]) -> [String:Any] in
      guard let width=viewport["width"],let height=viewport["height"] else { throw RepairPilotARError.invalidPoint }
      return try sharedAR.projectAnchor(id:id,viewportWidth:width,viewportHeight:height)
    }
    AsyncFunction("removeAnchor") { (id:String) -> Void in try sharedAR.removeAnchor(id:id) }
    AsyncFunction("clearAnchors") { () -> Void in sharedAR.clearAnchors() }
  }
}
