import ExpoModulesCore
import ARKit

final class RepairPilotLidarPreviewView: ExpoView {
  let sceneView = ARSCNView(frame: .zero)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    sceneView.automaticallyUpdatesLighting = false
    sceneView.rendersCameraGrain = false
    sceneView.rendersMotionBlur = false
    addSubview(sceneView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sceneView.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      startPreview()
    } else {
      pausePreview()
    }
  }

  func startPreview() {
    guard ARWorldTrackingConfiguration.isSupported else { return }
    let config = ARWorldTrackingConfiguration()
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
      config.frameSemantics.insert(.sceneDepth)
    }
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
      config.frameSemantics.insert(.smoothedSceneDepth)
    }
    config.worldAlignment = .gravity
    sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
  }

  func pausePreview() {
    sceneView.session.pause()
  }
}

public class RepairPilotLidarPreviewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RepairPilotLidarPreview")

    View(RepairPilotLidarPreviewView.self) {
      AsyncFunction("pause") { (view: RepairPilotLidarPreviewView) in
        view.pausePreview()
      }
      AsyncFunction("resume") { (view: RepairPilotLidarPreviewView) in
        view.startPreview()
      }
    }
  }
}
