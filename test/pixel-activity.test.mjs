import test from 'node:test'
import assert from 'node:assert/strict'
import { createActivityTracker, installPixelActivity, loadPixelScripts } from '../lib/pixel-animation.mjs'
import { fileURLToPath } from 'node:url'

function setup() {
  let now = 0
  const tracker = createActivityTracker({ clock: () => now, instance: 'test' })
  return { tracker, time: value => { now = value }, event: (id, type, data = {}) => tracker.session(id, { type, data }) }
}
test('host turn, stream, tool and compaction signals map to animation semantics', () => {
  const { tracker: t, event } = setup()
  event('one', 'turn/start'); assert.equal(t.snapshot().semantic, 'thinking')
  t.stream('one', { type: 'chunk', chunk: { type: 'text-delta', text: 'private text' } })
  assert.equal(t.snapshot().semantic, 'typing')
  t.stream('one', { type: 'chunk', chunk: { type: 'reasoning-delta' } })
  assert.equal(t.snapshot().semantic, 'thinking')
  event('one', 'tool/call', { name: 'bash', callId: 'c' }); assert.equal(t.snapshot().semantic, 'typing')
  event('one', 'compaction/start'); assert.equal(t.snapshot().semantic, 'compacting')
  event('one', 'compaction/end'); assert.equal(t.snapshot().semantic, 'thinking')
})
test('question and approval waits persist through unrelated parallel tool results', () => {
  const { tracker: t, event } = setup()
  event('one', 'tool/call', { name: 'ask_user_question', callId: 'q' })
  event('one', 'tool/result', { message: { callId: 'other' } })
  assert.equal(t.snapshot().semantic, 'notification')
  event('one', 'tool/result', { message: { callId: 'q' } })
  assert.equal(t.snapshot().semantic, 'thinking')
  event('one', 'approval/asked', { id: 'a' })
  assert.equal(t.snapshot().semantic, 'notification')
  event('one', 'approval/decided', { id: 'a', outcome: 'approved' })
  assert.equal(t.snapshot().semantic, 'thinking')
})
test('multiple sessions and child agents use the TUI context actions', () => {
  const { tracker: t, event } = setup()
  for (const id of ['a', 'b']) event(id, 'turn/start')
  assert.equal(t.snapshot().semantic, 'music')
  event('c', 'turn/start'); assert.equal(t.snapshot().semantic, 'building')
  t.subagent(true, { id: 'child1' }); t.subagent(true, { id: 'child2' })
  event('child1', 'turn/start')
  assert.equal(t.snapshot().semantic, 'conducting')
  assert.equal(t.snapshot().activeSessions, 3)
  t.subagent(false, { id: 'child1' }); t.subagent(false, { id: 'child2' })
  assert.equal(t.snapshot().semantic, 'building')
})
test('object-shaped turn reasons select error and terminal actions expire', () => {
  const { tracker: t, event, time } = setup()
  event('one', 'turn/start'); event('one', 'turn/end', { reason: { kind: 'error' } })
  const first = t.snapshot()
  assert.equal(first.semantic, 'error')
  time(4000)
  assert.equal(t.snapshot().semantic, 'idle')
  assert.notEqual(t.snapshot().revision, first.revision)
})
test('disposal and expiry release stale working and child states', () => {
  const { tracker: t, event, time } = setup()
  event('a', 'turn/start'); t.disposeSession('a')
  assert.equal(t.snapshot().semantic, 'idle')
  t.subagent(true, { id: 'child' }); event('child', 'turn/start')
  time(31 * 60 * 1000)
  assert.equal(t.snapshot().semantic, 'idle')
})
test('snapshots exclude session names, IDs, prompts, credentials and tool arguments', () => {
  const { tracker: t, event } = setup()
  event('secret-session', 'tool/call', { name: 'bash', arguments: { token: 'private-token' } })
  assert.deepEqual(Object.keys(t.snapshot()).sort(), ['activeSessions', 'activeSubagents', 'revision', 'semantic'])
  assert.doesNotMatch(JSON.stringify(t.snapshot()), /secret|token|bash/)
})
test('event subscriptions are disposed with the plugin and scripts precede widget startup', () => {
  const listeners = new Map(), disposers = []
  const tracker = installPixelActivity({ on(name, callback) { listeners.set(name, callback); return () => listeners.delete(name) } }, disposers)
  listeners.get('session/event')({ id: 'one' }, { type: 'turn/start' })
  listeners.get('agent/assistant-stream')({ agent: { session: { id: 'one' } }, frame: { type: 'chunk', chunk: { type: 'text-delta' } } })
  assert.equal(tracker.snapshot().semantic, 'typing')
  disposers.forEach(dispose => dispose()); assert.equal(listeners.size, 0)
  const scripts = loadPixelScripts(fileURLToPath(new URL('../', import.meta.url)))
  assert.ok(scripts.indexOf('DshWhalePixelCore =') < scripts.indexOf('DshWhalePixel ='))
  assert.ok(scripts.includes('DshWhalePixelTheme.setFrameSvg('))
  assert.ok(scripts.includes('bubble-small-1'))
  assert.ok(scripts.includes('bubble-small-2'))
  assert.ok(!scripts.includes('<svg'), 'Frame markup must be escaped for Desktop inline injection')
})
