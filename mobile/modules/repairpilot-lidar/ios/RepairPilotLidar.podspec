Pod::Spec.new do |s|
  s.name           = 'RepairPilotLidar'
  s.version        = '0.1.0'
  s.summary        = 'RepairPilot ARKit scene-depth measurement module'
  s.description    = 'Native LiDAR depth capture and calibrated two-point 3D measurement for RepairPilot.'
  s.author         = 'RepairPilot'
  s.homepage       = 'https://github.com/Manderson1031/RepairPilot'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/Manderson1031/RepairPilot.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ARKit', 'CoreImage', 'UIKit'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
