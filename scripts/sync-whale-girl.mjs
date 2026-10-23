import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const lock = JSON.parse(await readFile(path.join(root, 'upstream.lock.json'), 'utf8')).whaleGirl
const check = process.argv.includes('--check')
if (!/^[a-f0-9]{40}$/.test(lock.commit)) throw new Error('Animation source must use a full commit SHA')

async function download(url) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (proxy) {
    const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl',
      ['--fail', '--location', '--silent', '--show-error', '--max-time', '30', '--proxy', proxy, url],
      { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024, windowsHide: true })
    return stdout
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

// Validate every download before changing any checked-in file.
const files = await Promise.all(lock.files.map(async entry => {
  const target = path.resolve(root, entry.target)
  if (!target.startsWith(root + path.sep) && !target.startsWith(root)) throw new Error('Invalid target path')
  const bytes = check ? await readFile(target) : await download(
    `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/${entry.source}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== entry.sha256) throw new Error(`SHA-256 mismatch: ${entry.target}`)
  return { target, bytes, entry }
}))
for (const { target, bytes, entry } of files) {
  if (!check) {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target + '.tmp', bytes)
    await rename(target + '.tmp', target)
  }
  console.log(`${check ? 'Verified' : 'Synced'} ${entry.target}`)
}
