// MIT. Pixel dialogue presentation; font licenses live in assets/fonts/fusion-pixel/.
(function (scope) {
  'use strict'
  var NS = 'http://www.w3.org/2000/svg'
  var MODES = ['pixel', 'raster', 'classic']
  var fontPromise = null

  function fontReady() {
    if (!scope.document || !document.fonts || !scope.FontFace) return Promise.resolve(null)
    if (!fontPromise) fontPromise = fetch('/dsh-whale/pixel-theme/font.woff2').then(function (response) {
      if (!response.ok) throw new Error('Pixel font: HTTP ' + response.status)
      return response.arrayBuffer()
    }).then(function (bytes) {
      // The desktop bridge can route fetch consistently even on an app-scheme page.
      return new FontFace('DshWhalePixel', bytes, { weight: '400', style: 'normal', display: 'swap' }).load()
    }).then(function (face) { document.fonts.add(face); return face })
    return fontPromise
  }

  function fontSize(size, ratio) {
    ratio = Number(ratio) || 1
    if (!(ratio > 0)) ratio = 1
    size = Number(size) || 12
    return Math.max(12, Math.round(size * ratio / 12) * 12 / ratio)
  }
  function stepRect(x, y, w, h, unit) {
    unit = Math.min(unit, w / 6, h / 6)
    var r = x + w, b = y + h, u = unit
    return 'M ' + (x + 2 * u) + ' ' + y + ' H ' + (r - 2 * u) +
      ' V ' + (y + u) + ' H ' + (r - u) + ' V ' + (y + 2 * u) + ' H ' + r +
      ' V ' + (b - 2 * u) + ' H ' + (r - u) + ' V ' + (b - u) + ' H ' + (r - 2 * u) +
      ' V ' + b + ' H ' + (x + 2 * u) + ' V ' + (b - u) + ' H ' + (x + u) +
      ' V ' + (b - 2 * u) + ' H ' + x + ' V ' + (y + 2 * u) + ' H ' + (x + u) +
      ' V ' + (y + u) + ' H ' + (x + 2 * u) + ' Z'
  }

  function styles() {
    if (!scope.document || document.querySelector('[data-dshw-pixel-theme]')) return
    var style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-whale-widget')
    style.setAttribute('data-dshw-pixel-theme', '')
    style.textContent = [
      '.dshwv-root[data-pixel-dialogue="pixel"] .dshwv-text,.dshwv-root[data-pixel-dialogue="pixel"] .dshwv-text *,' +
      '.dshwv-root[data-pixel-dialogue="raster"] .dshwv-text,.dshwv-root[data-pixel-dialogue="raster"] .dshwv-text *{' +
      'font-family:DshWhalePixel,"Microsoft YaHei",sans-serif!important;font-synthesis:none;border-radius:0!important;text-shadow:none!important}',
      '.dshwv-root:not([data-pixel-dialogue="classic"]) [data-pixel-font]{font-size:var(--dshw-pixel-font-size)!important;letter-spacing:0!important}',
      '.dshwv-bubble-raster{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;opacity:0;transition:opacity .2s ease}',
      '.dshwv-pop-open.dshwv-raster-ready .dshwv-bubble-raster{opacity:1;transition-delay:.26s}',
      '.dshwv-pop.dshwv-raster-ready .dshwv-shapewrap>svg{opacity:0!important}',
      '.dshwv-dialogue-row{display:flex;align-items:center;gap:8px;margin:6px 0;color:#213170;font-size:12px}',
      '.dshwv-dialogue-style{flex:1;min-width:0;border:1px solid #b9cced;border-radius:4px;padding:4px;background:#fff;color:#213170}',
    ].join('\n')
    document.head.appendChild(style)
  }

  function mount(options) {
    var root = options.root, shape = options.shape, bubble = options.bubble, text = options.text
    var mode = 'pixel', source = null, builtin = true, disposed = false, revision = 0, pending = null
    var low = null, raf = null, svgUrl = null
    try { var saved = localStorage.getItem('dshw-pixel-dialogue'); if (MODES.indexOf(saved) >= 0) mode = saved } catch (err) {}
    var canvas = document.createElement('canvas')
    canvas.className = 'dshwv-bubble-raster'
    canvas.setAttribute('aria-hidden', 'true')
    var row = document.createElement('label')
    row.className = 'dshwv-dialogue-row'
    row.appendChild(document.createTextNode('对话框'))
    var select = document.createElement('select')
    select.className = 'dshwv-dialogue-style'
    select.setAttribute('aria-label', '对话框风格')
    ;[['pixel', '像素边框'], ['raster', '原框像素化'], ['classic', '经典样式']].forEach(function (item) {
      var option = document.createElement('option'); option.value = item[0]; option.textContent = item[1]; select.appendChild(option)
    })
    select.value = mode; row.appendChild(select); options.menu.appendChild(row)

    function observeText() { observer.observe(text, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }) }
    function fonts() {
      raf = null
      if (disposed) return
      observer.disconnect()
      try {
        var nodes = text.querySelectorAll('.dshwv-trow,.dshwv-label,.dshwv-amount,.dshwv-hint,.dshwv-period')
        nodes.forEach(function (node) { node.removeAttribute('data-pixel-font'); node.style.removeProperty('--dshw-pixel-font-size') })
        if (mode !== 'classic') {
          var sizes = Array.from(nodes, function (node) { return fontSize(parseFloat(getComputedStyle(node).fontSize), scope.devicePixelRatio) })
          nodes.forEach(function (node, i) { node.style.setProperty('--dshw-pixel-font-size', sizes[i] + 'px'); node.setAttribute('data-pixel-font', '') })
        }
      } finally { if (!disposed) observeText() }
    }
    function scheduleFonts() { if (!disposed && raf === null) raf = requestAnimationFrame(fonts) }
    var observer = new MutationObserver(scheduleFonts)
    observeText()

    function pixelShape(svg) {
      svg.setAttribute('data-pixel-frame', '')
      svg.querySelectorAll('.dshwv-bshape,.dshwv-b1,.dshwv-b2').forEach(function (node) {
        if (node.tagName.toLowerCase() !== 'path' && node.tagName.toLowerCase() !== 'ellipse') return
        var box = node.getBBox()
        if (!(box.width > 0 && box.height > 0)) return
        var path = document.createElementNS(NS, 'path')
        Array.from(node.attributes).forEach(function (attr) { if (!/^(d|cx|cy|rx|ry)$/.test(attr.name)) path.setAttribute(attr.name, attr.value) })
        path.setAttribute('d', stepRect(box.x, box.y, box.width, box.height, node.classList.contains('dshwv-bshape') ? 14 : 6))
        path.setAttribute('shape-rendering', 'crispEdges')
        path.setAttribute('stroke-linejoin', 'miter')
        path.setAttribute('stroke-linecap', 'butt')
        node.replaceWith(path)
      })
    }
    function paintRaster() {
      if (!low || disposed || mode !== 'raster') return
      var layout = getComputedStyle(shape), ratio = scope.devicePixelRatio || 1
      var cssWidth = parseFloat(layout.width), cssHeight = parseFloat(layout.height)
      if (!(cssWidth > 0 && cssHeight > 0)) return
      // The press animation scales the parent temporarily; use its steady layout size.
      var width = Math.max(1, Math.round(cssWidth * ratio)), height = Math.max(1, Math.round(cssHeight * ratio))
      canvas.width = width; canvas.height = height
      var context = canvas.getContext('2d')
      context.imageSmoothingEnabled = false
      context.drawImage(low, 0, 0, width, height)
      canvas.dataset.sourceWidth = String(low.width)
      canvas.dataset.sourceHeight = String(low.height)
      bubble.classList.add('dshwv-raster-ready')
    }
    function dataUrl(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader(); reader.onload = function () { resolve(reader.result) }; reader.onerror = reject; reader.readAsDataURL(blob)
      })
    }
    async function rasterize(svg, ticket, signal) {
      try {
        // SVG image decoding is self-contained: embed only the widget's own image route.
        await Promise.all(Array.from(svg.querySelectorAll('image'), async function (image) {
          var href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
          if (!/^\/dsh-whale\/bubble-img\.png\?/.test(href)) throw new Error('Unsupported frame image source')
          var response = await fetch(href, { signal: signal })
          if (!response.ok) throw new Error('Frame image: HTTP ' + response.status)
          var url = await dataUrl(await response.blob())
          image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href'); image.setAttribute('href', url)
        }))
        if (disposed || ticket !== revision) return
        svg.setAttribute('width', '1026'); svg.setAttribute('height', '700')
        var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
        svgUrl = url
        var image
        try {
          image = await new Promise(function (resolve, reject) {
            var image = new Image(); image.onload = function () { resolve(image) }; image.onerror = function () { reject(new Error('Frame SVG cannot be decoded')) }; image.src = url
          })
        } finally { URL.revokeObjectURL(url); if (svgUrl === url) svgUrl = null }
        if (disposed || ticket !== revision) return
        low = document.createElement('canvas'); low.width = 128; low.height = 87
        var ctx = low.getContext('2d', { willReadFrequently: true })
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(image, 0, 0, low.width, low.height)
        // Snap the silhouette's partially transparent edge before nearest-neighbour enlargement.
        var pixels = ctx.getImageData(0, 0, low.width, low.height)
        for (var i = 3; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i] >= 96 ? 255 : 0
        ctx.putImageData(pixels, 0, 0)
        paintRaster()
      } catch (err) {
        if (ticket === revision && !disposed && err.name !== 'AbortError') console.warn('[dsh-whale-pixel] Frame pixelation unavailable:', err.message)
      }
    }
    function render() {
      revision++
      if (pending) pending.abort()
      pending = null; low = null
      if (svgUrl) { URL.revokeObjectURL(svgUrl); svgUrl = null }
      bubble.classList.remove('dshwv-raster-ready')
      canvas.remove()
      root.dataset.pixelDialogue = mode
      var current = shape.querySelector('svg')
      if (source) {
        var svg = source.cloneNode(true)
        if (current) current.replaceWith(svg); else shape.prepend(svg)
        if (mode === 'pixel' && builtin) pixelShape(svg)
        if (mode === 'raster') {
          shape.appendChild(canvas); pending = new AbortController()
          rasterize(source.cloneNode(true), revision, pending.signal)
        }
      }
      scheduleFonts()
    }
    function frameChanged(frame) {
      if (disposed) return
      var svg = shape.querySelector('svg')
      source = svg ? svg.cloneNode(true) : null
      builtin = !frame || frame.builtin === true || frame.id === 'frame_classic'
      render()
    }
    function change() {
      mode = select.value
      try { localStorage.setItem('dshw-pixel-dialogue', mode) } catch (err) {}
      render()
    }
    function resize() { paintRaster(); scheduleFonts() }
    function dispose() {
      if (disposed) return
      disposed = true; revision++; observer.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
      if (pending) pending.abort()
      if (svgUrl) URL.revokeObjectURL(svgUrl)
      if (raf !== null) cancelAnimationFrame(raf)
      select.removeEventListener('change', change); scope.removeEventListener('resize', resize); scope.removeEventListener('pagehide', pagehide)
      row.remove(); canvas.remove(); source = null; low = null
    }
    function pagehide(event) { if (!event.persisted) dispose() }
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    if (resizeObserver) resizeObserver.observe(root)
    scope.addEventListener('resize', resize); scope.addEventListener('pagehide', pagehide); select.addEventListener('change', change)
    frameChanged(null)
    fontReady().then(scheduleFonts).catch(function (err) { console.warn('[dsh-whale-pixel] Pixel font unavailable:', err.message) })
    return { frameChanged: frameChanged, dispose: dispose }
  }
  scope.DshWhalePixelTheme = Object.freeze({ mount: mount, fontSize: fontSize, stepRect: stepRect, fontReady: fontReady })
  styles()
})(typeof globalThis === 'object' ? globalThis : window)
