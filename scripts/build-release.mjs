import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const git = args => execFileSync('git', args, { cwd: root, windowsHide: true })
if (git(['status', '--porcelain', '--untracked-files=no']).toString().trim()) {
  throw new Error('Commit tracked changes before building a release from HEAD')
}
const taskTempRoot = path.resolve(os.tmpdir())
const temporary = await mkdtemp(path.join(taskTempRoot, 'dsh-whale-release-'))
try {
  const stage = path.join(temporary, 'source')
  await mkdir(stage)
  const archive = path.join(temporary, 'source.tar')
  git(['archive', '--format=tar', '--output=' + archive, 'HEAD'])
  execFileSync('tar', ['-xf', archive, '-C', stage], { windowsHide: true })

  const pkg = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'))
  const lock = JSON.parse(await readFile(path.join(stage, 'upstream.lock.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-whale-widget')
  assert.equal(pkg.private, true)
  assert.match(pkg.version, /^\d+\.\d+\.\d+-pixel\.\d+$/)
  assert.ok((await readFile(path.join(stage, 'lib', 'index.js'), 'utf8')).includes("const BUILD_VERSION = '" + pkg.version + "'"), 'Host version must match the package')
  assert.deepEqual(await readFile(path.join(stage, 'README.upstream.md')), git(['show', lock.widget.commit + ':README.md']), 'Keep the locked upstream README unchanged')

  execFileSync(process.execPath, ['tools/ci-audit.mjs'], { cwd: stage, stdio: 'inherit', windowsHide: true })
  const [packed] = JSON.parse(execSync('npm pack --ignore-scripts --json', {
    cwd: stage, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
  }))
  const files = new Set(packed.files.map(file => file.path))
  for (const required of ['README.upstream.md', 'assets/pixel-core.js', 'assets/pixel-raster.js', 'assets/pixel-adapter.js', 'assets/pixel-theme.js', ...lock.whaleGirl.files.map(file => file.target), ...lock.pixelFont.files.map(file => file.target)]) {
    assert.ok(files.has(required), 'Missing release resource: ' + required)
  }
  assert.ok(![...files].some(file => /^assets\/DSniang/.test(file)), 'The removed static character must stay out of the package')

  const output = path.join(root, '.test-output', 'release', pkg.version)
  await mkdir(output, { recursive: true })
  const zip = 'dsh-whale-pixel-' + pkg.version + '.zip'
  const tarball = pkg.name + '-' + pkg.version + '.tgz'
  await copyFile(path.join(stage, packed.filename), path.join(output, tarball))
  git(['archive', '--format=zip', '--prefix=dsh-whale-pixel/', '--output=' + path.join(output, zip), 'HEAD'])
  const hashes = []
  for (const file of [tarball, zip]) {
    const hash = createHash('sha256').update(await readFile(path.join(output, file))).digest('hex')
    hashes.push(hash + '  ' + file)
  }
  await writeFile(path.join(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n')
  console.log(JSON.stringify({ version: pkg.version, commit: git(['rev-parse', 'HEAD']).toString().trim(), output, files: [tarball, zip, 'SHA256SUMS.txt'] }, null, 2))
} finally {
  // Only remove the fresh temporary directory created by this invocation.
  if (path.dirname(temporary) === taskTempRoot && path.basename(temporary).startsWith('dsh-whale-release-')) {
    await rm(temporary, { recursive: true, force: true })
  }
}
