import fs from 'node:fs'
import path from 'node:path'

// Pure aggregate of host events. Snapshots expose animation semantics and counts only.
export function createActivityTracker(options = {}) {
  const clock = options.clock || Date.now
  const sessions = new Map(), agents = new Map()
  const ttl = 30 * 60 * 1000
  const instance = options.instance || `${clock().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let revision = 0, terminal = null, previousSemantic = 'idle'

  function trim() {
    const now = clock()
    for (const [id, record] of sessions) if (now - record.at > ttl) { sessions.delete(id); revision++ }
    for (const [id, at] of agents) if (now - at > ttl) { agents.delete(id); revision++ }
    while (sessions.size > 128) sessions.delete(sessions.keys().next().value)
    while (agents.size > 128) agents.delete(agents.keys().next().value)
  }
  function session(id, event) {
    const type = event && event.type, data = event && event.data || {}, now = clock()
    id = String(id || 'default')
    let record = sessions.get(id)
    if (type === 'turn/end') {
      if (!record) return
      sessions.delete(id)
      const reason = data.reason && typeof data.reason === 'object' ? data.reason.kind : data.reason || data.stopReason
      if (!record.subagent) terminal = { semantic: /error|failed/.test(String(reason || '')) ? 'error' : 'happy', until: now + 3000 }
      revision++; return
    }
    const phases = {
      'turn/start': 'thinking', 'step/start': 'thinking', 'llm/start': 'thinking',
      'assistant/message': 'typing', 'assistant/delta': 'typing', 'assistant/message_delta': 'typing',
      'message/delta': 'typing', 'tool/call': 'typing', 'tool/result': 'thinking',
      'compaction/start': 'compacting', 'context/compact/start': 'compacting',
      'compaction/end': 'thinking', 'context/compact/end': 'thinking',
      'approval/asked': 'notification', 'approval/decided': 'thinking', 'approval/resolved': 'thinking',
    }
    let phase = phases[type]
    if (!phase) return
    if (!record) record = { phase: 'thinking', pending: new Set(), at: now, subagent: agents.has(id) }
    if (type === 'turn/start') record.pending.clear()
    const callId = String(data.callId || data.id || data.message && data.message.callId || '')
    if (type === 'tool/call' && String(data.name || data.toolName || '') === 'ask_user_question') {
      record.pending.add(callId || 'question'); phase = 'notification'
    }
    if (type === 'approval/asked') record.pending.add(callId || 'approval')
    if (type === 'tool/result' || type === 'approval/resolved' || type === 'approval/decided') {
      if (callId) record.pending.delete(callId)
      else record.pending.clear()
    }
    record.phase = record.pending.size ? 'notification' : phase
    record.at = now
    sessions.delete(id); sessions.set(id, record)
    if (agents.has(id)) agents.set(id, now)
    terminal = null; revision++; trim()
  }
  function subagent(start, info) {
    const id = String(info && (info.id || info.runId) || '')
    if (!id) return
    if (start) {
      agents.set(id, clock())
      if (sessions.has(id)) sessions.get(id).subagent = true
    } else { agents.delete(id); sessions.delete(id) }
    revision++; trim()
  }
  function disposeSession(id) {
    if (sessions.delete(String(id))) revision++
    if (agents.delete(String(id))) revision++
  }
  function stream(id, frame) {
    if (!frame) return
    let phase
    if (frame.type === 'start') phase = 'thinking'
    else if (frame.type === 'chunk') {
      const type = frame.chunk && frame.chunk.type
      if (type === 'reasoning-delta') phase = 'thinking'
      if (type === 'text-delta' || type === 'tool-call-delta') phase = 'typing'
    }
    if (!phase) return
    const record = sessions.get(String(id))
    if (record && record.phase === phase) { record.at = clock(); return }
    session(id, { type: phase === 'thinking' ? 'llm/start' : 'assistant/delta' })
  }
  function snapshot() {
    trim()
    const live = [...sessions.values()]
    const mainCount = live.filter(record => !record.subagent).length
    let semantic = 'idle'
    if (live.some(record => record.phase === 'notification')) semantic = 'notification'
    else if (live.some(record => record.phase === 'compacting')) semantic = 'compacting'
    else if (agents.size >= 2) semantic = 'conducting'
    else if (mainCount >= 3) semantic = 'building'
    else if (agents.size || mainCount >= 2) semantic = 'music'
    else if (live.length) semantic = live[live.length - 1].phase
    else if (terminal && terminal.until > clock()) semantic = terminal.semantic
    if (semantic !== previousSemantic) { previousSemantic = semantic; revision++ }
    return { semantic, activeSessions: mainCount, activeSubagents: agents.size, revision: `${instance}:${revision}` }
  }
  return { session, subagent, disposeSession, stream, snapshot }
}

export function installPixelActivity(ctx, disposers) {
  const tracker = createActivityTracker()
  disposers.push(ctx.on('session/event', (session, event) => tracker.session(session && session.id, event)))
  disposers.push(ctx.on('session/disposed', session => tracker.disposeSession(session && session.id)))
  disposers.push(ctx.on('agent/assistant-stream', payload => {
    const id = payload && payload.agent && payload.agent.session && payload.agent.session.id
    if (id) tracker.stream(id, payload.frame)
  }))
  for (const [name, start] of [['subagent/start', true], ['subagent/end', false]]) {
    disposers.push(ctx.on(name, info => tracker.subagent(start, info)))
  }
  return tracker
}

export function loadPixelScripts(root) {
  // Synchronous prefix guarantees the adapter exists before the existing widget boots,
  // including the desktop host's one-time inline script injection.
  try {
    return ['pixel-core.js', 'pixel-raster.js', 'pixel-adapter.js', 'pixel-theme.js'].map(file => fs.readFileSync(path.join(root, 'assets', file), 'utf8')).join('\n;\n') + '\n;\n'
  } catch (err) {
    console.warn('[dsh-whale-pixel] Animation scripts unavailable:', err.message)
    return ''
  }
}
