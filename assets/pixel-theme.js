// MIT. Pixel dialogue presentation; font licenses live in assets/fonts/fusion-pixel/.
(function (scope) {
  'use strict'
  var NS = 'http://www.w3.org/2000/svg'
  var MODES = ['pixel', 'raster', 'classic']
  var fontPromise = null
  var frameTemplate = null

  function setFrameSvg(source) {
    try {
      var doc = new DOMParser().parseFromString(source, 'image/svg+xml')
      if (doc.querySelector('parsererror') || doc.documentElement.getAttribute('viewBox') !== '0 0 128 87') throw new Error('Invalid frame SVG')
      var parts = ['bubble-main', 'bubble-small-1', 'bubble-small-2'].map(function (id) {
        var original = doc.getElementById(id), group = document.createElementNS(NS, 'g')
        if (!original) throw new Error('Missing frame part: ' + id)
        original.querySelectorAll('path').forEach(function (node) {
          var path = document.createElementNS(NS, 'path'), fill = node.getAttribute('fill'), d = node.getAttribute('d')
          if (!/^#[\da-f]{6}$/i.test(fill) || !d || !/^(?:[MHVZ\s]|\d)+$/.test(d)) throw new Error('Invalid frame path')
          path.setAttribute('fill', fill); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('d', d)
          group.appendChild(path)
        })
        if (!group.childNodes.length) throw new Error('Empty frame part: ' + id)
        return group
      })
      frameTemplate = parts
      return true
    } catch (err) {
      console.warn('[dsh-whale-pixel] Frame SVG unavailable:', err.message)
      return false
    }
  }

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

  function quantizePixels(data, palette) {
    var cells = new Int16Array(data.length / 4)
    cells.fill(-1)
    for (var i = 0; i < cells.length; i++) {
      var offset = i * 4, alpha = data[offset + 3]
      if (alpha < 8) continue
      var best = -1, distance = Infinity
      palette.forEach(function (color, index) {
        var dr = data[offset] - color[0], dg = data[offset + 1] - color[1], db = data[offset + 2] - color[2]
        var da = alpha - color[3]
        var score = dr * dr + dg * dg + db * db + da * da * 0.05
        if (score < distance) { distance = score; best = index }
      })
      // Match unpremultiplied RGB first: a translucent white edge must stay white.
      // Then snap coverage to the authored opacity, leaving faint outer pixels clear.
      if (best >= 0 && alpha >= palette[best][3] / 2) cells[i] = best
    }
    return cells
  }

  function pixelPaths(cells, width, height, palette) {
    var stride = width + 1, edges = palette.map(function () { return new Map() })
    function edge(color, x, y, direction) {
      var vertex = y * stride + x, graph = edges[color]
      graph.set(vertex, (graph.get(vertex) || 0) | (1 << direction))
    }
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
      var i = y * width + x, color = cells[i]
      if (color < 0) continue
      if (y === 0 || cells[i - width] !== color) edge(color, x, y, 0)
      if (x === width - 1 || cells[i + 1] !== color) edge(color, x + 1, y, 1)
      if (y === height - 1 || cells[i + width] !== color) edge(color, x + 1, y + 1, 2)
      if (x === 0 || cells[i - 1] !== color) edge(color, x, y + 1, 3)
    }
    var paths = [], moves = [1, stride, -1, -stride]
    edges.forEach(function (graph, index) {
      var contours = []
      while (graph.size) {
        var start = graph.keys().next().value, vertex = start, last = -1, commands = []
        var mask = graph.get(start), direction = [0, 1, 2, 3].find(function (d) { return mask & (1 << d) })
        do {
          mask = graph.get(vertex) & ~(1 << direction)
          if (mask) graph.set(vertex, mask); else graph.delete(vertex)
          vertex += moves[direction]
          var command = (direction % 2 ? 'V ' + Math.floor(vertex / stride) : 'H ' + (vertex % stride))
          if (direction === last) commands[commands.length - 1] = command; else commands.push(command)
          last = direction
          if (vertex === start) break
          mask = graph.get(vertex)
          // Keep diagonally touching pixels as separate contours by turning right first.
          direction = [(last + 1) % 4, last, (last + 3) % 4, (last + 2) % 4].find(function (d) { return mask & (1 << d) })
        } while (direction !== undefined)
        contours.push('M ' + (start % stride) + ' ' + Math.floor(start / stride) + ' ' + commands.join(' ') + ' Z')
      }
      if (contours.length) paths.push({ color: palette[index], d: contours.join(' ') })
    })
    return paths
  }

  function framePalette(svg) {
    var context = document.createElement('canvas').getContext('2d'), palette = []
    function inherited(node, name, fallback) {
      for (; node && node.nodeType === 1; node = node.parentNode) if (node.hasAttribute(name)) return node.getAttribute(name)
      return fallback
    }
    svg.querySelectorAll('path,ellipse,circle,rect,polygon,polyline').forEach(function (node) {
      var opacity = 1
      for (var parent = node; parent && parent.nodeType === 1; parent = parent.parentNode) {
        if (parent.hasAttribute('opacity')) opacity *= Number(parent.getAttribute('opacity'))
      }
      ;['fill', 'stroke'].forEach(function (name) {
        var paint = inherited(node, name, name === 'fill' ? '#000000' : 'none')
        if (paint === 'none' || paint === 'transparent') return
        context.fillStyle = '#000000'; context.fillStyle = paint
        var resolved = context.fillStyle, color
        if (/^#[0-9a-f]{6}$/i.test(resolved)) {
          color = [parseInt(resolved.slice(1, 3), 16), parseInt(resolved.slice(3, 5), 16), parseInt(resolved.slice(5, 7), 16), 255]
        } else {
          var parts = resolved.match(/[\d.]+/g)
          if (!parts || parts.length < 3) return
          color = [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts.length > 3 ? Number(parts[3]) * 255 : 255]
        }
        color[3] = Math.round(color[3] * opacity * Number(inherited(node, name + '-opacity', '1')))
        if (color[3] >= 8 && !palette.some(function (p) { return p.join(',') === color.join(',') })) palette.push(color)
      })
    })
    return palette
  }

  function imagePalette(data, palette) {
    var histogram = new Map(), count = 0
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue
      var color = [data[i], data[i + 1], data[i + 2], 255]
      if (Math.min(color[0], color[1], color[2]) >= 240) color = [255, 255, 255, 255]
      var key = color.join(','); count++
      histogram.set(key, (histogram.get(key) || 0) + 1)
    }
    // Image frames have no declared palette. Retain dominant tones, merging similar
    // colors and rare interpolation fringes into a bounded, flat-color palette.
    var candidates = Array.from(histogram).sort(function (a, b) { return b[1] - a[1] })
    var minimum = Math.max(2, Math.ceil(count * 0.003))
    candidates.forEach(function (entry) {
      if (palette.length >= 32 || (palette.length && entry[1] < minimum)) return
      var color = entry[0].split(',').map(Number)
      if (!palette.some(function (p) { return (p[0] - color[0]) ** 2 + (p[1] - color[1]) ** 2 + (p[2] - color[2]) ** 2 < 48 ** 2 })) palette.push(color)
    })
    return palette
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
      '.dshwv-bubble-raster{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .2s ease}',
      '.dshwv-pop .dshwv-bubble-raster,.dshwv-pop .dshwv-bubble-raster *{pointer-events:none!important}',
      '.dshwv-pop-open.dshwv-raster-ready .dshwv-bubble-raster{opacity:1;transition-delay:.26s}',
      '.dshwv-pop.dshwv-raster-ready .dshwv-shapewrap>svg[data-pixel-source]{opacity:0!important}',
      '.dshwv-dialogue-row{display:flex;align-items:center;gap:8px;margin:6px 0;color:#213170;font-size:12px}',
      '.dshwv-dialogue-style{flex:1;min-width:0;border:1px solid #b9cced;border-radius:4px;padding:4px;background:#fff;color:#213170}',
    ].join('\n')
    document.head.appendChild(style)
  }

  function mount(options) {
    var root = options.root, shape = options.shape, bubble = options.bubble, text = options.text
    var mode = 'pixel', source = null, builtin = true, useTemplate = true, disposed = false, revision = 0, pending = null
    var raf = null, svgUrl = null
    try { var saved = localStorage.getItem('dshw-pixel-dialogue'); if (MODES.indexOf(saved) >= 0) mode = saved } catch (err) {}
    var vector = document.createElementNS(NS, 'svg')
    vector.setAttribute('class', 'dshwv-bubble-raster')
    vector.setAttribute('aria-hidden', 'true')
    vector.setAttribute('viewBox', '0 0 128 87')
    vector.setAttribute('preserveAspectRatio', 'none')
    vector.setAttribute('shape-rendering', 'crispEdges')
    var row = document.createElement('label')
    row.className = 'dshwv-dialogue-row'
    row.appendChild(document.createTextNode('对话框'))
    var select = document.createElement('select')
    select.className = 'dshwv-dialogue-style'
    select.setAttribute('aria-label', '对话框风格')
    ;[['pixel', '像素倒角方形'], ['raster', '像素椭圆'], ['classic', '经典样式']].forEach(function (item) {
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
        if (frameTemplate && useTemplate && !node.classList.contains('dshwv-bshape')) {
          var group = document.createElementNS(NS, 'g')
          group.setAttribute('class', node.getAttribute('class'))
          group.setAttribute('data-pixel-small', node.classList.contains('dshwv-b1') ? '1' : '2')
          var part = frameTemplate[node.classList.contains('dshwv-b1') ? 1 : 2].cloneNode(true)
          // Keep geometry transforms inside the animated group; its CSS transform
          // controls the existing bubble opening/closing animation.
          part.setAttribute('transform', 'scale(' + (1026 / 128) + ' ' + (700 / 87) + ')')
          part.setAttribute('shape-rendering', 'crispEdges')
          group.appendChild(part); node.replaceWith(group)
          return
        }
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
    function paintTemplate() {
      vector.replaceChildren()
      frameTemplate.forEach(function (part, index) {
        var group = part.cloneNode(true)
        group.setAttribute('data-pixel-part', String(index))
        if (index) group.setAttribute('data-pixel-small', String(index))
        vector.appendChild(group)
      })
      vector.dataset.sourceWidth = '128'; vector.dataset.sourceHeight = '87'
      shape.appendChild(vector)
      bubble.classList.add('dshwv-raster-ready')
    }
    function paintVector(data, width, height, palette) {
      vector.replaceChildren()
      pixelPaths(quantizePixels(data, palette), width, height, palette).forEach(function (entry) {
        var path = document.createElementNS(NS, 'path')
        path.setAttribute('fill', '#' + entry.color.slice(0, 3).map(function (c) { return c.toString(16).padStart(2, '0') }).join(''))
        if (entry.color[3] < 255) path.setAttribute('fill-opacity', String(entry.color[3] / 255))
        path.setAttribute('fill-rule', 'evenodd')
        path.setAttribute('d', entry.d)
        vector.appendChild(path)
      })
      vector.dataset.sourceWidth = String(width); vector.dataset.sourceHeight = String(height)
      shape.appendChild(vector)
      bubble.classList.add('dshwv-raster-ready')
    }
    function dataUrl(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader(); reader.onload = function () { resolve(reader.result) }; reader.onerror = reject; reader.readAsDataURL(blob)
      })
    }
    async function rasterize(svg, ticket, signal) {
      try {
        var palette = framePalette(svg), hasImages = !!svg.querySelector('image')
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
        var low = document.createElement('canvas'); low.width = 128; low.height = 87
        var ctx = low.getContext('2d', { willReadFrequently: true })
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(image, 0, 0, low.width, low.height)
        var pixels = ctx.getImageData(0, 0, low.width, low.height)
        if (hasImages) palette = imagePalette(pixels.data, palette)
        paintVector(pixels.data, low.width, low.height, palette)
      } catch (err) {
        if (ticket === revision && !disposed && err.name !== 'AbortError') console.warn('[dsh-whale-pixel] Frame pixelation unavailable:', err.message)
      }
    }
    function render() {
      revision++
      if (pending) pending.abort()
      pending = null
      if (svgUrl) { URL.revokeObjectURL(svgUrl); svgUrl = null }
      bubble.classList.remove('dshwv-raster-ready')
      vector.remove()
      root.dataset.pixelDialogue = mode
      var current = shape.querySelector('svg')
      if (source) {
        var svg = source.cloneNode(true)
        svg.setAttribute('data-pixel-source', '')
        if (current) current.replaceWith(svg); else shape.prepend(svg)
        if (mode === 'pixel' && builtin) pixelShape(svg)
        if (mode === 'raster') {
          if (useTemplate && frameTemplate) paintTemplate()
          else {
            pending = new AbortController()
            rasterize(source.cloneNode(true), revision, pending.signal)
          }
        }
      }
      scheduleFonts()
    }
    function frameChanged(frame, override) {
      if (disposed) return
      var svg = shape.querySelector('svg')
      source = svg ? svg.cloneNode(true) : null
      builtin = !frame || frame.builtin === true || frame.id === 'frame_classic'
      useTemplate = builtin && !(override && Object.keys(override).length)
      render()
    }
    function change() {
      mode = select.value
      try { localStorage.setItem('dshw-pixel-dialogue', mode) } catch (err) {}
      render()
    }
    function resize() { scheduleFonts() }
    function dispose() {
      if (disposed) return
      disposed = true; revision++; observer.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
      if (pending) pending.abort()
      if (svgUrl) URL.revokeObjectURL(svgUrl)
      if (raf !== null) cancelAnimationFrame(raf)
      select.removeEventListener('change', change); scope.removeEventListener('resize', resize); scope.removeEventListener('pagehide', pagehide)
      row.remove(); vector.remove(); source = null
    }
    function pagehide(event) { if (!event.persisted) dispose() }
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    if (resizeObserver) resizeObserver.observe(root)
    scope.addEventListener('resize', resize); scope.addEventListener('pagehide', pagehide); select.addEventListener('change', change)
    frameChanged(null)
    fontReady().then(scheduleFonts).catch(function (err) { console.warn('[dsh-whale-pixel] Pixel font unavailable:', err.message) })
    return { frameChanged: frameChanged, dispose: dispose }
  }
  scope.DshWhalePixelTheme = Object.freeze({ mount: mount, fontSize: fontSize, stepRect: stepRect, fontReady: fontReady, quantizePixels: quantizePixels, pixelPaths: pixelPaths, setFrameSvg: setFrameSvg })
  styles()
})(typeof globalThis === 'object' ? globalThis : window)
