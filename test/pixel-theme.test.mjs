import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import '../assets/pixel-theme.js'

const { fontSize, quantizePixels, pixelPaths } = globalThis.DshWhalePixelTheme
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

test('frame colors snap to the authored palette; pale inner edges become white and faint outer edges become transparent', () => {
  const palette = [[32, 49, 112, 255], [255, 255, 255, 255]]
  const data = new Uint8ClampedArray([
    32, 49, 112, 255,  // original blue
    39, 56, 118, 255,  // almost blue
    229, 231, 240, 255, // pale blue inside the white bubble
    32, 49, 112, 90,   // faint outer blue
    32, 49, 112, 180,  // solid outer blue
    255, 255, 255, 90, // faint outer white
    255, 255, 255, 180, // solid white edge stays white, not blue
    255, 255, 255, 1,  // invisible image hit target
    0, 0, 0, 0,
  ])
  assert.deepEqual([...quantizePixels(data, palette)], [0, 0, 1, -1, 0, -1, 1, -1, -1])
  assert.deepEqual(palette, [[32, 49, 112, 255], [255, 255, 255, 255]])
})

test('custom frame colors and authored translucency remain distinct from interpolation fringes', () => {
  const palette = [[189, 40, 72, 255], [245, 228, 230, 255], [60, 120, 80, 102]]
  const data = new Uint8ClampedArray([
    190, 43, 74, 255, 245, 229, 230, 255,
    60, 120, 80, 102, 60, 120, 80, 70, 60, 120, 80, 30,
  ])
  assert.deepEqual([...quantizePixels(data, palette)], [0, 1, 2, 2, -1])
  assert.deepEqual([...quantizePixels(data, [])], [-1, -1, -1, -1, -1])
})

// Independently sample the generated SVG's even-odd polygons at each cell center.
// This checks holes, diagonal contacts and color boundaries without reusing the tracer.
function contains(path, px, py) {
  const tokens = path.match(/[MHVZ]|-?\d+/g)
  let x = 0, y = 0, sx = 0, sy = 0, inside = false
  function line(nx, ny) {
    if ((y > py) !== (ny > py) && px < x + (py - y) * (nx - x) / (ny - y)) inside = !inside
    x = nx; y = ny
  }
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++]
    if (command === 'M') { x = sx = Number(tokens[i++]); y = sy = Number(tokens[i++]) }
    else if (command === 'H') line(Number(tokens[i++]), y)
    else if (command === 'V') line(x, Number(tokens[i++]))
    else if (command === 'Z') line(sx, sy)
    else assert.fail('Non-orthogonal SVG command: ' + command)
  }
  return inside
}

test('clean SVG contours exactly cover the pixel grid, including holes and diagonal contacts', () => {
  const palette = [[32, 49, 112, 255], [255, 255, 255, 255], [189, 40, 72, 128]]
  const fixtures = [
    { width: 3, height: 3, cells: [0, 0, 0, 0, -1, 0, 0, 0, 0] },
    { width: 2, height: 2, cells: [0, -1, -1, 0] },
    { width: 2, height: 2, cells: [0, 1, 1, 0] },
    { width: 4, height: 1, cells: [-1, -1, -1, -1] },
  ]
  let seed = 7301
  for (let n = 0; n < 100; n++) {
    const width = 1 + n % 11, height = 1 + n % 7
    const cells = Array.from({ length: width * height }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return (seed >>> 28) % 4 - 1
    })
    fixtures.push({ width, height, cells })
  }
  for (const { width, height, cells } of fixtures) {
    const paths = pixelPaths(Int16Array.from(cells), width, height, palette)
    assert.equal(new Set(paths.map(p => p.color)).size, paths.length)
    for (const path of paths) assert.match(path.d, /^(?:[MHVZ\s]|\d)+$/)
    for (let y = -1; y <= height; y++) for (let x = -1; x <= width; x++) {
      const colors = paths.filter(p => contains(p.d, x + 0.5, y + 0.5)).map(p => palette.indexOf(p.color))
      const expected = x >= 0 && x < width && y >= 0 && y < height ? cells[y * width + x] : -1
      assert.deepEqual(colors, expected === -1 ? [] : [expected], `cell ${x},${y} in ${width}x${height}`)
    }
  }
})
