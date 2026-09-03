Pod::Spec.new do |s|
  s.name           = 'RepairPilotAR'
  s.version        = '0.1.0'
  s.summary        = 'RepairPilot native AR guidance engine'
  s.description    = 'ARKit world-anchor and scene-depth support for RepairPilot guided repair overlays.'
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
