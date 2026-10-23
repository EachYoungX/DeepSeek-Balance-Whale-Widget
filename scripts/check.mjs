import { spawnSync } from 'node:child_process'

const commands = [
  ['scripts/sync-whale-girl.mjs', '--check'],
  ...['lib/index.js', 'lib/pixel-animation.mjs', 'assets/whale-widget.js', 'assets/pixel-core.js', 'assets/pixel-raster.js', 'assets/pixel-adapter.js', 'scripts/export-patches.mjs']
    .map(file => ['--check', file]),
  ['--test', 'test/pixel-core.test.mjs', 'test/pixel-activity.test.mjs'],
  ['tools/z-layer-audit.mjs', 'assets/whale-widget.js'],
  ['tools/ci-audit.mjs', '--no-pack'],
  ['tools/ci-audit-selftest.mjs'],
  ['tools/check-dead-settings.mjs'],
]
for (const args of commands) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
