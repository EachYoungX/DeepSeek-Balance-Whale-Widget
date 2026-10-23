import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import '../assets/pixel-core.js'

const { compileKit, compileRasterTimings, frameAt, resolveKey, createMachine } = globalThis.DshWhalePixelCore
const raw = JSON.parse(readFileSync(new URL('../assets/whaleGirl/frames.json', import.meta.url)))
const kit = compileKit(raw)
const rasterTimings = JSON.parse(readFileSync(new URL('../assets/whaleGirl/img/timings.json', import.meta.url)))
function machine() { return createMachine(kit, { clock: () => 0 }) }

test('all vendored frames compile with a lossless, stable crop and case-sensitive colors', () => {
  assert.equal(Object.keys(kit.byKey).length, 22)
  assert.equal(Object.values(kit.byKey).reduce((sum, a) => sum + a.frames.length, 0), 267)
  assert.deepEqual(kit.bounds, { x: 5, y: 1, width: 31, height: 29 })
  assert.notDeepEqual(kit.palette.A, kit.palette.a)
})
test('durations advance at exact boundaries, loop, and clamp one-shot playback', () => {
  const animation = kit.byKey.idle
  assert.equal(frameAt(animation, -20), 0)
  assert.equal(frameAt(animation, animation.frames[0].dur - 1), 0)
  assert.equal(frameAt(animation, animation.frames[0].dur), 1)
  assert.equal(frameAt(animation, animation.totalMs), 0)
  assert.equal(frameAt(animation, animation.totalMs * 3, false), animation.frames.length - 1)
})
test('all 267 original PNGs match frame timing and preserve the source resolution', () => {
  compileRasterTimings(rasterTimings, kit)
  for (const [key, frames] of Object.entries(rasterTimings)) for (const frame of frames) {
    const bytes = readFileSync(new URL('../assets/whaleGirl/img/' + key + '/' + frame.file, import.meta.url))
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(bytes.readUInt32BE(16), 301)
    assert.equal(bytes.readUInt32BE(20), 288)
  }
  const broken = structuredClone(rasterTimings)
  broken.idle[0].dur++
  assert.throws(() => compileRasterTimings(broken, kit), /timing mismatch/)
})
test('whaleGirl semantic, heart, mood and idle fallback order matches the source skin', () => {
  assert.equal(resolveKey(kit, 'happy'), 'thumbs-up')
  assert.equal(resolveKey(kit, 'idle-spout'), 'smile-hearts')
  assert.equal(resolveKey(kit, 'unknown', true, 'error'), 'smile-hearts')
  assert.equal(resolveKey(kit, 'unknown', false, 'error'), 'error')
  assert.equal(resolveKey(kit, 'unknown'), 'idle')
})
test('malformed or unmapped frames fail before mounting the renderer', () => {
  const broken = structuredClone(raw)
  broken.animations[0].frames[0].rows[0] = '?'.repeat(42)
  assert.throws(() => compileKit(broken), /palette/)
  broken.animations[0].frames[0].dur = 0
  assert.throws(() => compileKit(broken), /duration/)
  assert.throws(() => compileKit({ ...raw, size: [0, 30] }), /dimensions/)
})
test('idle sleeps after ten seconds and a click plays waking before the directional poke', () => {
  const m = machine()
  assert.equal(m.sample(9999).asleep, false)
  assert.equal(m.sample(10_000).key, 'sleeping')
  m.event('press', { side: 'left' }, 10_100)
  assert.equal(m.sample(10_100).key, 'waking')
  assert.equal(m.sample(10_100 + kit.byKey.waking.totalMs).key, 'poke-left')
  assert.equal(m.sample(15_000).asleep, false)
  assert.equal(m.sample(20_100).key, 'sleeping')
})
test('work wakes the character, then stays working beyond the idle deadline', () => {
  const m = machine(); m.sample(10_000)
  m.event('activity', { revision: 'boot:1', semantic: 'typing' }, 11_000)
  assert.equal(m.sample(11_000).key, 'waking')
  assert.equal(m.sample(13_000).key, 'typing')
  assert.equal(m.sample(60_000).key, 'typing')
})
test('a real mouseenter followed by a click queues the poke after waking', () => {
  const m = machine(); m.sample(10_000)
  m.event('notice', {}, 10_100)
  m.event('press', { side: 'right' }, 10_120)
  assert.equal(m.sample(10_120).key, 'waking')
  assert.equal(m.sample(10_100 + kit.byKey.waking.totalMs).key, 'poke-right')
})
test('repeated activity polls preserve animation phase and allow true idle sleep', () => {
  const m = machine()
  m.event('activity', { revision: 'boot:1', semantic: 'typing' }, 10)
  const since = m.sample(10).since
  m.event('activity', { revision: 'boot:1', semantic: 'typing' }, 1000)
  assert.equal(m.sample(1000).since, since)
  m.event('activity', { revision: 'boot:2', semantic: 'idle' }, 1100)
  m.event('activity', { revision: 'boot:2', semantic: 'idle' }, 10_000)
  assert.equal(m.sample(11_100).key, 'sleeping')
})
test('drag takes priority, cancellation clears it, and rapid presses become tickle', () => {
  const m = machine()
  m.event('press', { side: 'right' }, 0)
  assert.equal(m.sample(0).key, 'poke-right')
  m.event('press', { side: 'right' }, 150)
  m.event('press', { side: 'left' }, 300)
  assert.equal(m.sample(300).key, 'tickle')
  m.event('drag-start', {}, 400)
  m.event('error', {}, 500)
  assert.equal(m.sample(500).key, 'drag')
  m.event('drag-end', {}, 600)
  assert.notEqual(m.sample(700).key, 'drag')
})
test('hover and refresh do not interrupt a higher priority click reaction', () => {
  const m = machine()
  m.event('press', { side: 'left' }, 0)
  m.event('notice', {}, 20)
  m.event('loading', {}, 40)
  assert.equal(m.sample(50).key, 'poke-left')
  m.event('ready', {}, 60)
  assert.notEqual(m.sample(3000).key, 'thinking')
})
test('one-shot celebrations and errors return to idle and can fall asleep', () => {
  for (const name of ['success', 'error', 'notification']) {
    const m = machine(); m.event(name, {}, 10)
    assert.notEqual(m.sample(10).key, 'idle')
    assert.equal(m.sample(10_010).key, 'sleeping')
  }
})
