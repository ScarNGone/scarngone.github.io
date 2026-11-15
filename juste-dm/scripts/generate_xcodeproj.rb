#!/usr/bin/env ruby
# frozen_string_literal: true

# Régénère JusteDM.xcodeproj à partir des fichiers présents sur le disque.
# À relancer après avoir ajouté, renommé ou supprimé un fichier source :
#
#   gem install xcodeproj
#   ruby scripts/generate_xcodeproj.rb
#
# Le projet généré est versionné : inutile de lancer ce script pour simplement compiler l'app.

require 'fileutils'
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT_PATH = File.join(ROOT, 'JusteDM.xcodeproj')
APP_NAME = 'JusteDM'
BUNDLE_ID = 'io.github.scarngone.justedm'
DEPLOYMENT_TARGET = '16.0'
# Format de projet lisible par Xcode 14 et les versions suivantes.
OBJECT_VERSION = 56

# Fichiers compilés dans l'app, et fichiers copiés tels quels dans l'app.
SOURCE_GLOBS = ['JusteDM/**/*.swift', 'Core/Sources/**/*.swift'].freeze
RESOURCE_PATHS = [
  'JusteDM/Resources/Assets.xcassets',
  'JusteDM/Resources/services.json',
  'JusteDM/Resources/guard.js'
].freeze
# Fichiers visibles dans Xcode sans faire partie de l'app.
REFERENCE_PATHS = ['JusteDM/Info.plist', 'README.md'].freeze

FileUtils.rm_rf(PROJECT_PATH)
project = Xcodeproj::Project.new(PROJECT_PATH, false, OBJECT_VERSION)
target = project.new_target(:application, APP_NAME, :ios, DEPLOYMENT_TARGET, nil, :swift)

# Retrouve ou crée le groupe Xcode qui correspond à un dossier.
def group_for(project, directory)
  directory.split('/').reject { |part| part == '.' || part.empty? }.reduce(project.main_group) do |group, part|
    group.children.find { |child| child.isa == 'PBXGroup' && child.display_name == part } ||
      group.new_group(part, part)
  end
end

FILE_TYPES = { '.json' => 'text.json', '.js' => 'sourcecode.javascript', '.md' => 'net.daringfireball.markdown' }.freeze

def reference(project, relative_path)
  group = group_for(project, File.dirname(relative_path))
  file = group.new_reference(File.join(ROOT, relative_path))
  file.last_known_file_type ||= FILE_TYPES[File.extname(relative_path)]
  file
end

# Le gabarit ajoute Foundation avec le chemin d'un SDK précis. Swift lie déjà les
# bibliothèques du système tout seul, et ce chemin casserait d'une version de Xcode à l'autre.
target.frameworks_build_phase.clear
project.frameworks_group.clear
project.frameworks_group.remove_from_project

sources = SOURCE_GLOBS.flat_map { |glob| Dir.glob(glob, base: ROOT) }.sort
abort 'Aucun fichier source trouvé' if sources.empty?
target.add_file_references(sources.map { |path| reference(project, path) })

RESOURCE_PATHS.each do |path|
  abort "Ressource absente : #{path}" unless File.exist?(File.join(ROOT, path))
end
target.add_resources(RESOURCE_PATHS.map { |path| reference(project, path) })

REFERENCE_PATHS.each do |path|
  reference(project, path) if File.exist?(File.join(ROOT, path))
end

target.build_configurations.each do |config|
  settings = config.build_settings
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  settings['MARKETING_VERSION'] = '1.0'
  settings['CURRENT_PROJECT_VERSION'] = '1'
  settings['INFOPLIST_FILE'] = 'JusteDM/Info.plist'
  settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  settings['TARGETED_DEVICE_FAMILY'] = '1'
  settings['SWIFT_VERSION'] = '5.0'
  settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  settings['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['CODE_SIGN_IDENTITY'] = 'Apple Development'
  settings.delete('CODE_SIGN_IDENTITY[sdk=iphoneos*]')
  settings['DEVELOPMENT_TEAM'] = ''
  settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks']
  settings['SWIFT_EMIT_LOC_STRINGS'] = 'NO'
end

project.build_configurations.each do |config|
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
end

project.root_object.development_region = 'fr'
project.root_object.known_regions = %w[fr Base]
project.root_object.attributes['BuildIndependentTargetsInParallel'] = '1'
project.root_object.attributes['LastUpgradeCheck'] = '1600'
project.root_object.attributes['LastSwiftUpdateCheck'] = '1600'

# Identifiants stables d'une génération à l'autre, pour des différences lisibles dans git.
project.predictabilize_uuids
project.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.set_launch_target(target)
scheme.save_as(PROJECT_PATH, APP_NAME, true)

puts "Projet généré : #{sources.length} fichiers source, #{RESOURCE_PATHS.length} ressources."
