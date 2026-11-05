require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# 1.2.0 (UX-11): the local stackd-cloud plugin. `npx cap sync ios` names the
# pod after the npm package (stackd-cloud -> StackdCloud), so s.name must stay.
Pod::Spec.new do |s|
  s.name = 'StackdCloud'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Proprietary' }
  s.homepage = 'https://stackdplatform.com'
  s.author = package['author']
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
