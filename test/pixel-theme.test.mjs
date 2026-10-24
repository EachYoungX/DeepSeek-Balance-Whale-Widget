import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import '../assets/pixel-theme.js'

const { fontSize } = globalThis.DshWhalePixelTheme
test('pixel font and original license notices match the pinned release bytes', () => {
  const lock = JSON.parse(readFileSync(new URL('../upstream.lock.json', import.meta.url)))
  assert.equal(lock.pixelFont.repository, 'TakWolf/fusion-pixel-font')
  for (const file of lock.pixelFont.files) {
    const data = readFileSync(new URL('../' + file.target, import.meta.url))
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, file.target)
    if (file.target.endsWith('.woff2')) assert.equal(data.subarray(0, 4).toString(), 'wOF2')
  }
  assert.match(readFileSync(new URL('../assets/fonts/fusion-pixel/OFL.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/)
})
test('pixel text aligns to the font grid on common DPI ratios and retains a readable minimum', () => {
  assert.equal(fontSize(23, 1), 24)
  assert.equal(fontSize(23, 2), 24)
  assert.equal(fontSize(17, 2), 18)
  assert.equal(fontSize(21, 1.25), 19.2)
  assert.equal(fontSize(4, 2), 12)
  assert.equal(fontSize(NaN, 0), 12)
})
