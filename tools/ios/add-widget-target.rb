# 1.2.2 (HG-15 WG-5, docs/phone-widgets-plan.md §9): adds the StackdWidgets
# WidgetKit extension target to ios/App/App.xcodeproj. There is no Mac on the
# team, so this runs once on GitHub's macOS runner
# (.github/workflows/ios-widget-target.yml) through the xcodeproj gem that
# ships with CocoaPods; the changed project.pbxproj comes back as an artifact
# and is committed, so the project in the repo is the real one.
#
# Idempotent: a second run finds the target and only re-applies its settings.
require 'xcodeproj'

PROJECT = File.expand_path('../../ios/App/App.xcodeproj', __dir__)
NAME = 'StackdWidgets'
TEAM = 'YA3DTZR26U'
SWIFT = %w[StackdWidgets.swift Snapshot.swift Views.swift QuickAddIntent.swift].freeze
SHARED_WITH_APP = %w[QuickAddIntent.swift].freeze

project = Xcodeproj::Project.open(PROJECT)
app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')
app_settings = app.build_configurations.first.build_settings
version = app_settings['MARKETING_VERSION'] or abort('App has no MARKETING_VERSION')
build = app_settings['CURRENT_PROJECT_VERSION'] or abort('App has no CURRENT_PROJECT_VERSION')

target = project.targets.find { |t| t.name == NAME }
created = target.nil?
target ||= project.new_target(:app_extension, NAME, :ios, '17.0', nil, :swift)

group = project.main_group.children.find { |g| g.respond_to?(:path) && g.path == NAME } ||
        project.main_group.new_group(NAME, NAME)

ref = lambda do |file|
  group.files.find { |f| f.path == file } || group.new_reference(file)
end

SWIFT.each do |file|
  r = ref.call(file)
  target.source_build_phase.add_file_reference(r, true)
  app.source_build_phase.add_file_reference(r, true) if SHARED_WITH_APP.include?(file)
end
%w[Localizable.xcstrings PrivacyInfo.xcprivacy].each do |file|
  target.resources_build_phase.add_file_reference(ref.call(file), true)
end
%w[Info.plist StackdWidgets.entitlements].each { |file| ref.call(file) }

target.add_system_frameworks(%w[WidgetKit SwiftUI])

target.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.stackd.finance.widgets'
  s['INFOPLIST_FILE'] = "#{NAME}/Info.plist"
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = "#{NAME}/#{NAME}.entitlements"
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = TEAM
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['SWIFT_VERSION'] = '5.0'
  s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  # Kept equal to the app's by tools/version.cjs (4 lines of each since HG-15).
  s['MARKETING_VERSION'] = version
  s['CURRENT_PROJECT_VERSION'] = build
end

# The app keeps iOS 15 while QuickAddIntent (iOS 17) is compiled into it too:
# AppIntents is weak-linked so the app still launches on iOS 15.
app.build_configurations.each do |config|
  flags = Array(config.build_settings['OTHER_LDFLAGS'] || ['$(inherited)'])
  flags = ['$(inherited)'] + flags unless flags.include?('$(inherited)')
  flags += ['-weak_framework', 'AppIntents'] unless flags.each_cons(2).include?(['-weak_framework', 'AppIntents'])
  config.build_settings['OTHER_LDFLAGS'] = flags
end

embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
unless embed.files_references.include?(target.product_reference)
  bf = embed.add_file_reference(target.product_reference, true)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end
app.add_dependency(target) unless app.dependencies.any? { |d| d.target == target }

# The widget gallery strings come in five languages.
project.root_object.known_regions = (project.root_object.known_regions + %w[fr it es pt]).uniq

project.save
puts "#{created ? 'created' : 'updated'} #{NAME} (#{version} / #{build})"
