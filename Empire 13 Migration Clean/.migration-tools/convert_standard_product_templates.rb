require 'json'
require 'fileutils'
require 'digest'

ROOT = File.expand_path('..', __dir__)
REFERENCE = File.join(ROOT, 'templates/product.high-variant.json')
BACKUP_ROOT = File.join('/private/tmp', 'citylocs-empire13-standard-template-backup')
HEADER = <<~COMMENT
  /*
   * ------------------------------------------------------------
   * IMPORTANT: The contents of this file are auto-generated.
   *
   * This file may be updated by the Shopify admin theme editor
   * or related systems. Please exercise caution as any changes
   * made to this file may be overwritten.
   * ------------------------------------------------------------
   */
COMMENT

def parse_json(path)
  JSON.parse(File.read(path).sub(%r{^/\*.*?\*/\s*}m, ''))
end

reference_main = parse_json(REFERENCE).fetch('sections').fetch('main')
standard_blocks = %w[title vendor rating price description form share collapsible-tab]
removable_legacy_blocks = %w[key_details]
obsolete_custom_liquid_hash = '13b9f15ea5ff'
converted = []
skipped = []

Dir[File.join(ROOT, 'templates/product*.json')].sort.each do |path|
  next if File.basename(path) == 'product.json'
  next if File.basename(path) == 'product.high-variant.json'

  document = parse_json(path)
  main_key, old_main = document.fetch('sections', {}).find do |_key, section|
    %w[static-product static-product-3-columns].include?(section['type'])
  end
  next unless old_main

  old_blocks = old_main.fetch('blocks', {})
  block_types = old_blocks.values.map { |block| block['type'] }.compact
  unsupported = block_types.reject do |type|
    standard_blocks.include?(type) || removable_legacy_blocks.include?(type) ||
      type == 'custom-liquid' || type.start_with?('shopify://apps/')
  end

  custom_liquid_blocks = old_blocks.values.select { |block| block['type'] == 'custom-liquid' }
  has_unknown_custom_liquid = custom_liquid_blocks.any? do |block|
    content = block.fetch('settings', {}).values.join
    Digest::SHA256.hexdigest(content)[0, 12] != obsolete_custom_liquid_hash
  end

  configured_key_details = old_blocks.values.any? do |block|
    block['type'] == 'key_details' && block.fetch('settings', {}).values.any? { |value| !value.nil? && value != '' }
  end

  if unsupported.any? || has_unknown_custom_liquid || configured_key_details
    skipped << [File.basename(path), unsupported]
    next
  end

  new_main = Marshal.load(Marshal.dump(reference_main))
  app_blocks = old_blocks.select { |_id, block| block.fetch('type', '').start_with?('shopify://apps/') }

  unless app_blocks.empty?
    insertion_index = new_main.fetch('block_order').index('section_flex_pdp_installments') || 3
    app_blocks.each do |id, block|
      new_main.fetch('blocks')[id] = block
      new_main.fetch('block_order').insert(insertion_index, id)
      insertion_index += 1
    end
  end

  relative = path.delete_prefix(ROOT + '/')
  backup_path = File.join(BACKUP_ROOT, relative)
  FileUtils.mkdir_p(File.dirname(backup_path))
  FileUtils.cp(path, backup_path)

  document.fetch('sections')[main_key] = new_main
  File.write(path, HEADER + JSON.pretty_generate(document) + "\n")
  converted << File.basename(path)
end

puts "Converted #{converted.length} templates:"
converted.each { |name| puts "  #{name}" }
puts "Skipped #{skipped.length} templates with custom product blocks:"
skipped.each { |name, types| puts "  #{name}: #{types.join(', ')}" }
puts "Backups: #{BACKUP_ROOT}"
