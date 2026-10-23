// MIT. Frame timing and whaleGirl semantic fallbacks reference dsh-TUI;
// see NOTICE.md and assets/whaleGirl/LICENSE.dsh-TUI.
(function (scope) {
  'use strict'
  var SEMANTICS = Object.freeze({ notice: 'smile-hearts', 'idle-spout': 'smile-hearts',
    happy: 'thumbs-up', success: 'thumbs-up', warning: 'notification', look: 'idle-look',
    working: 'typing', responding: 'typing', waiting: 'thinking', attention: 'notification' })

  function compileKit(raw) {
    if (!raw || !Array.isArray(raw.size) || raw.size.length !== 2) throw new Error('Invalid sprite size')
    var width = raw.size[0], height = raw.size[1]
    if (![width, height].every(function (n) { return Number.isInteger(n) && n > 0 && n <= 256 })) throw new Error('Invalid sprite dimensions')
    if (!raw.palette || !Array.isArray(raw.animations) || raw.animations.length > 100) throw new Error('Invalid sprite kit')
    var palette = Object.create(null), byKey = Object.create(null)
    Object.keys(raw.palette).forEach(function (symbol) {
      var color = raw.palette[symbol]
      if (symbol.length !== 1 || symbol === '.' || !/^#[a-f\d]{6}$/i.test(color)) throw new Error('Invalid palette entry')
      palette[symbol] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 255]
    })
    var minX = width, minY = height, maxX = -1, maxY = -1, count = 0
    raw.animations.forEach(function (animation) {
      if (!animation || typeof animation.key !== 'string' || !/^[a-z][a-z-]*$/.test(animation.key) || byKey[animation.key]) throw new Error('Invalid animation key')
      if (!Array.isArray(animation.frames) || !animation.frames.length) throw new Error('Empty animation')
      var totalMs = 0, ends = []
      animation.frames.forEach(function (frame) {
        if (++count > 5000 || !Number.isFinite(frame.dur) || frame.dur <= 0 || frame.dur > 60_000) throw new Error('Invalid frame duration')
        if (!Array.isArray(frame.rows) || frame.rows.length !== height) throw new Error('Invalid frame height')
        frame.rows.forEach(function (row, y) {
          if (typeof row !== 'string' || row.length !== width) throw new Error('Invalid frame width')
          for (var x = 0; x < width; x++) {
            if (row[x] === '.') continue
            if (!palette[row[x]]) throw new Error('Unknown palette symbol')
            minX = Math.min(minX, x); maxX = Math.max(maxX, x)
            minY = Math.min(minY, y); maxY = Math.max(maxY, y)
          }
        })
        totalMs += frame.dur; ends.push(totalMs)
      })
      byKey[animation.key] = { key: animation.key, frames: animation.frames, totalMs: totalMs, ends: ends }
    })
    if (!byKey.idle || maxX < 0) throw new Error('Missing idle animation or opaque pixels')
    return { width: width, height: height, palette: palette, byKey: byKey,
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } }
  }

  function frameAt(animation, elapsed, loop) {
    var time = Math.max(0, elapsed)
    time = loop === false ? Math.min(time, animation.totalMs - 0.001) : time % animation.totalMs
    for (var i = 0; i < animation.ends.length; i++) if (time < animation.ends[i]) return i
    return animation.frames.length - 1
  }

  function resolveKey(kit, semantic, heart, mood) {
    var candidates = [SEMANTICS[semantic] || semantic, heart ? 'smile-hearts' : '', SEMANTICS[mood] || mood, 'idle']
    for (var i = 0; i < candidates.length; i++) if (kit.byKey[candidates[i]]) return candidates[i]
    return 'idle'
  }

  function createMachine(kit, options) {
    options = options || {}
    var clock = options.clock || Date.now, sleepDelay = options.sleepDelay === undefined ? 10_000 : options.sleepDelay
    var lastActivity = clock(), asleep = false, dragging = false, loading = false
    var activity = 'idle', revision = null, reaction = null, afterWake = null, presses = []
    var currentKey = '', since = lastActivity, idleCycle = 0

    function react(semantic, now, priority) {
      var key = resolveKey(kit, semantic, false, 'idle')
      if (reaction && reaction.until > now && reaction.priority > priority) return
      reaction = { key: key, since: now, until: now + kit.byKey[key].totalMs, priority: priority }
    }
    function touch(now, following) {
      lastActivity = now
      if (asleep) {
        asleep = false
        react('waking', now, 90)
        afterWake = following || null
        return true
      }
      return false
    }
    function event(name, data, now) {
      data = data || {}; now = now === undefined ? clock() : now
      if (name === 'activity') {
        // Repeated polling of the same snapshot must not reset idle time or animation phase.
        if (data.revision === revision) return
        revision = data.revision
        var previous = activity
        activity = data.semantic || 'idle'
        if (activity !== 'idle') {
          var woke = touch(now)
          if (!woke && activity !== previous && (activity === 'happy' || activity === 'error')) react(activity, now, 70)
        } else if (previous !== 'idle') lastActivity = now
        return
      }
      if (name === 'drag-start') {
        touch(now); dragging = true; reaction = null; afterWake = null; return
      }
      if (name === 'drag-end') { dragging = false; touch(now); return }
      if (name === 'loading') { loading = true; touch(now); return }
      if (name === 'ready') { loading = false; return }
      if (name === 'press') {
        presses = presses.filter(function (at) { return now - at < 1200 }); presses.push(now)
        var poke = presses.length >= 3 ? 'tickle' : (data.side === 'left' ? 'poke-left' : 'poke-right')
        if (reaction && reaction.key === 'waking' && reaction.until > now) {
          afterWake = poke; lastActivity = now; return
        }
        if (!touch(now, poke)) react(poke, now, 80)
        return
      }
      if (name === 'notice') {
        if (!touch(now) && !dragging && activity === 'idle') react('notice', now, 20)
        return
      }
      if (name === 'error') loading = false
      if (name === 'success' || name === 'error' || name === 'notification' || name === 'semantic') {
        var semantic = name === 'semantic' ? data.key : name
        if (!touch(now, semantic)) react(semantic, now, 60)
      }
    }
    function sample(now) {
      now = now === undefined ? clock() : now
      if (reaction && reaction.until <= now) {
        var end = reaction.until
        reaction = null
        if (afterWake) { var next = afterWake; afterWake = null; react(next, end, 80) }
        if (reaction && reaction.until <= now) reaction = null
      }
      var active = activity !== 'idle' && activity !== 'happy' && activity !== 'error'
      if (!dragging && !loading && !active && !reaction && now - lastActivity >= sleepDelay) asleep = true
      var key
      if (dragging) key = resolveKey(kit, 'drag')
      else if (reaction) key = reaction.key
      else if (active) key = resolveKey(kit, activity)
      else if (loading) key = resolveKey(kit, 'thinking')
      else if (asleep) key = resolveKey(kit, 'sleeping')
      else {
        idleCycle = Math.floor(Math.max(0, now - lastActivity) / 4000)
        key = resolveKey(kit, ['idle', 'idle-look', 'idle-spout', 'swim'][idleCycle % 4])
      }
      if (key !== currentKey) { currentKey = key; since = now }
      var started = reaction && !dragging ? reaction.since : since
      var animation = kit.byKey[key], elapsed = Math.max(0, now - started)
      var frame = frameAt(animation, elapsed, !reaction || dragging)
      var remainder = elapsed % animation.totalMs
      var nextMs = animation.ends[frame] - remainder
      if (reaction && !dragging) nextMs = Math.min(nextMs, reaction.until - now)
      if (!active && !loading && !dragging && !reaction && !asleep) {
        nextMs = Math.min(nextMs, lastActivity + sleepDelay - now, lastActivity + (idleCycle + 1) * 4000 - now)
      }
      return { key: key, frame: frame, rows: animation.frames[frame].rows, asleep: asleep,
        nextMs: Math.max(16, nextMs), since: started }
    }
    return { event: event, sample: sample }
  }
  scope.DshWhalePixelCore = Object.freeze({ compileKit: compileKit, frameAt: frameAt,
    resolveKey: resolveKey, createMachine: createMachine, semantics: SEMANTICS })
})(typeof globalThis === 'object' ? globalThis : window)
