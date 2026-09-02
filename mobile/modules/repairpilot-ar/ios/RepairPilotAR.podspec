Pod::Spec.new do |s|
  s.name           = 'RepairPilotAR'
  s.version        = '0.1.0'
  s.summary        = 'RepairPilot native AR guidance engine'
  s.description    = 'ARKit world-anchor support for RepairPilot guided repair overlays.'
  s.author         = 'RepairPilot'
  s.homepage       = 'https://github.com/Manderson1031/RepairPilot'
  s.platforms      = { :ios => '15.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ARKit', 'UIKit'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
