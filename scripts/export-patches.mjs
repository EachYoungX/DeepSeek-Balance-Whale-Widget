import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const lock = JSON.parse(await readFile(path.join(root, 'upstream.lock.json'), 'utf8'))
const destination = path.resolve(root, process.argv[2] || '.test-output/pixel-animation.patch')
const bytes = execFileSync('git', ['format-patch', '--binary', '--full-index', '--stdout', `${lock.widget.commit}..HEAD`],
  { cwd: root, maxBuffer: 10 * 1024 * 1024, windowsHide: true })
if (!bytes.length) throw new Error('No committed customization after the locked upstream base')
await mkdir(path.dirname(destination), { recursive: true })
await writeFile(destination, bytes)
console.log(`Exported ${bytes.length} bytes: ${destination}`)
