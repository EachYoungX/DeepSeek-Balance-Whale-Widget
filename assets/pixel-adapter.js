// MIT. Widget-specific rendering and event adapter; core has no DOM dependencies.
(function (scope) {
  'use strict'
  var core = scope.DshWhalePixelCore
  if (!core || !scope.document) return

  function hull(points) {
    points.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] })
    function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) }
    var lower = [], upper = []
    points.forEach(function (p) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) })
    points.reverse().forEach(function (p) { while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) })
    return lower.slice(0, -1).concat(upper.slice(0, -1))
  }

  function mount(options) {
    var image = options.image, parent = image.parentNode, canvas = document.createElement('canvas')
    var kit = null, machine = null, context = null, current = null, timer = null, raf = null, disposed = false
    var role = options.role || 'default', enabled = true, cache = new Map(), pendingActivity = null
    var controller = new AbortController()
    try { enabled = localStorage.getItem('dshw-pixel-enabled') !== 'false' } catch (err) {}
    canvas.className = 'dshwv-img dshwv-pixel'
    canvas.style.imageRendering = 'pixelated'
    canvas.style.display = 'none'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', '鲸娘像素动画')
    parent.appendChild(canvas)
    var toggle = document.createElement('button')
    toggle.type = 'button'; toggle.className = 'dshwv-pixel-toggle'
    toggle.style.cssText = 'display:block;width:100%;margin:6px 0;padding:6px;border:1px solid #b9cced;border-radius:6px;background:#f0f6ff;color:#213170;cursor:pointer'
    options.menu.appendChild(toggle)

    function active() { return !disposed && !!kit && enabled && role === 'default' }
    function stop() {
      if (timer !== null) clearTimeout(timer)
      if (raf !== null) cancelAnimationFrame(raf)
      timer = null; raf = null
    }
    function visibility() {
      stop()
      var on = active()
      image.style.visibility = on ? 'hidden' : ''
      canvas.style.display = on ? 'block' : 'none'
      toggle.textContent = '像素动画：' + (enabled ? '开' : '关') + (enabled && role !== 'default' ? '（默认角色）' : '')
      toggle.setAttribute('aria-pressed', String(enabled))
      if (on && !document.hidden) tick()
    }
    function renderFrame(sample) {
      var id = sample.key + ':' + sample.frame
      var rendered = cache.get(id)
      var box = kit.bounds, size = Math.max(box.width, box.height)
      var padX = size - box.width, padY = size - box.height
      if (!rendered) {
        var pixels = new Uint8ClampedArray(size * size * 4), points = []
        for (var y = 0; y < box.height; y++) for (var x = 0; x < box.width; x++) {
          var color = kit.palette[sample.rows[y + box.y][x + box.x]]
          if (!color) continue
          var dx = x + padX, dy = y + padY
          pixels.set(color, (dy * size + dx) * 4)
          points.push([dx, dy], [dx + 1, dy], [dx, dy + 1], [dx + 1, dy + 1])
        }
        var polygon = hull(points).map(function (p) { return (p[0] / size * 100) + '% ' + (p[1] / size * 100) + '%' }).join(',')
        rendered = { data: new ImageData(pixels, size, size), clip: polygon ? 'polygon(' + polygon + ')' : 'inset(100%)' }
        cache.set(id, rendered)
      }
      context.putImageData(rendered.data, 0, 0)
      canvas.style.clipPath = rendered.clip
      canvas.dataset.animation = sample.key
      canvas.dataset.frame = String(sample.frame)
    }
    function tick() {
      if (!active() || document.hidden) return
      try {
        var sample = machine.sample()
        if (!current || sample.key !== current.key || sample.frame !== current.frame) renderFrame(sample)
        current = sample
        timer = setTimeout(function () { timer = null; raf = requestAnimationFrame(function () { raf = null; tick() }) }, sample.nextMs)
      } catch (err) { fail(err) }
    }
    function fail(err) {
      kit = null; stop(); image.style.visibility = ''; canvas.style.display = 'none'
      toggle.textContent = '像素动画：加载失败，点击重试'
      console.warn('[dsh-whale-pixel]', err && err.message || err)
    }
    function signal(name, data) {
      if (!machine || !active()) return
      data = data || {}
      if (name === 'press') {
        var rect = canvas.getBoundingClientRect()
        var left = data.x < rect.left + rect.width / 2
        data = { side: left !== !!options.getFlip() ? 'left' : 'right' }
      }
      machine.event(name, data)
      stop(); tick()
    }
    function hit(event, flip) {
      if (!active() || !current) return false
      var rect = canvas.getBoundingClientRect(), box = kit.bounds
      if (!rect.width || !rect.height) return false
      var rx = (event.clientX - rect.left) / rect.width, ry = (event.clientY - rect.top) / rect.height
      if (rx < 0 || ry < 0 || rx >= 1 || ry >= 1) return false
      if (flip) rx = 1 - rx
      var size = canvas.width
      var x = Math.min(size - 1, Math.floor(rx * size)) - (size - box.width) + box.x
      var y = Math.floor(ry * size) - (size - box.height) + box.y
      return !!kit.palette[(current.rows[y] || '')[x]]
    }
    async function load() {
      try {
        var response = await fetch('/dsh-whale/pixel-frames.json', { signal: controller.signal })
        if (!response.ok) throw new Error('Frame data: HTTP ' + response.status)
        var next = core.compileKit(await response.json())
        if (disposed) return
        kit = next; machine = core.createMachine(kit); current = null; cache.clear()
        canvas.width = canvas.height = Math.max(kit.bounds.width, kit.bounds.height)
        context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D is unavailable')
        context.imageSmoothingEnabled = false
        if (pendingActivity) machine.event('activity', pendingActivity)
        visibility()
      } catch (err) { if (!disposed) fail(err) }
    }
    function clickToggle() {
      if (!kit) { load(); return }
      enabled = !enabled
      try { localStorage.setItem('dshw-pixel-enabled', String(enabled)) } catch (err) {}
      if (enabled && role !== 'default') options.selectDefault()
      visibility()
    }
    function onVisibility() { visibility() }
    function onEnter() { signal('notice') }
    function dispose() {
      if (disposed) return
      disposed = true; stop(); controller.abort()
      image.style.visibility = ''; canvas.remove(); toggle.remove(); cache.clear()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointerenter', onEnter)
      toggle.removeEventListener('click', clickToggle)
      scope.removeEventListener('pagehide', onPageHide)
      scope.removeEventListener('pageshow', onPageShow)
    }
    function onPageHide(event) { if (event.persisted) stop(); else dispose() }
    function onPageShow() { if (!disposed) visibility() }
    toggle.addEventListener('click', clickToggle)
    canvas.addEventListener('pointerenter', onEnter)
    document.addEventListener('visibilitychange', onVisibility)
    scope.addEventListener('pagehide', onPageHide)
    scope.addEventListener('pageshow', onPageShow)
    load()
    return { signal: signal, hit: hit, active: active,
      setRole: function (id) { role = id; visibility() },
      activity: function (snapshot) { if (!snapshot) return; pendingActivity = snapshot; signal('activity', snapshot) },
      dispose: dispose }
  }
  scope.DshWhalePixel = Object.freeze({ mount: mount })
})(typeof globalThis === 'object' ? globalThis : window)
