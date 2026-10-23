// MIT. Original PNG playback; imagery and provenance are described in NOTICE.md.
(function (scope) {
  'use strict'
  var WIDTH = 301, HEIGHT = 288, SIZE = 301, TOP = SIZE - HEIGHT

  function hull(points) {
    points.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] })
    function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) }
    var lower = [], upper = []
    points.forEach(function (p) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) })
    points.reverse().forEach(function (p) { while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) })
    return lower.slice(0, -1).concat(upper.slice(0, -1))
  }

  function create(options) {
    var entries = new Map(), queue = [], running = 0, disposed = false
    var bytes = 0, maxBytes = 32 * 1024 * 1024
    var protectedKey = 'idle', shownKey = 'idle'
    var scratch = document.createElement('canvas')
    scratch.width = scratch.height = SIZE
    var scratchContext = scratch.getContext('2d', { willReadFrequently: true })

    function pooled(task) {
      return new Promise(function (resolve, reject) {
        queue.push({ task: task, resolve: resolve, reject: reject }); pump()
      })
    }
    function pump() {
      while (running < 6 && queue.length) {
        var job = queue.shift(); running++
        ;(function (job) {
          Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(function () { running--; pump() })
        })(job)
      }
    }
    function close(record) { if (record && record.image && record.image.close) record.image.close() }
    async function decode(key, frame) {
      if (disposed) throw new Error('Renderer disposed')
      var response = await fetch('/dsh-whale/pixel-raster/' + key + '/' + frame.file, { signal: options.signal })
      if (!response.ok) throw new Error('PNG frame: HTTP ' + response.status)
      var blob = await response.blob(), bitmap
      if (scope.createImageBitmap) bitmap = await scope.createImageBitmap(blob)
      else {
        var url = URL.createObjectURL(blob)
        try {
          bitmap = await new Promise(function (resolve, reject) {
            var image = new Image(); image.onload = function () { resolve(image) }; image.onerror = reject; image.src = url
          })
        } finally { URL.revokeObjectURL(url) }
      }
      if (disposed || bitmap.width !== WIDTH || bitmap.height !== HEIGHT) {
        close({ image: bitmap }); throw new Error('Unexpected PNG frame dimensions')
      }
      var mask = null, points = [], opaque = 0
      try {
        scratchContext.clearRect(0, 0, SIZE, SIZE)
        scratchContext.drawImage(bitmap, 0, TOP)
        var rgba = scratchContext.getImageData(0, 0, SIZE, SIZE).data
        mask = new Uint8Array(SIZE * SIZE)
        for (var y = 0; y < SIZE; y++) {
          var left = -1, right = -1
          for (var x = 0; x < SIZE; x++) if (rgba[(y * SIZE + x) * 4 + 3] > 10) {
            mask[y * SIZE + x] = 1; opaque++; if (left < 0) left = x; right = x
          }
          if (left >= 0) points.push([left, y], [right + 1, y], [left, y + 1], [right + 1, y + 1])
        }
        if (!opaque) mask = null
      } catch (err) { mask = null }
      var clip = mask ? 'polygon(' + hull(points).map(function (p) { return p[0] / SIZE * 100 + '% ' + p[1] / SIZE * 100 + '%' }).join(',') + ')' : ''
      return { image: bitmap, mask: mask, clip: clip, bytes: WIDTH * HEIGHT * 4 + (mask ? mask.byteLength : 0) }
    }
    function trim() {
      for (var pair of entries) {
        if (bytes <= maxBytes) break
        var key = pair[0], entry = pair[1]
        if (!entry.frames || key === protectedKey || key === shownKey) continue
        entry.frames.forEach(close); bytes -= entry.bytes; entries.delete(key)
      }
    }
    function ready(key) {
      var existing = entries.get(key)
      if (existing) return existing.promise
      var entry = { frames: null, error: false, bytes: 0, promise: null }
      entries.set(key, entry)
      entry.promise = Promise.allSettled(options.timings[key].map(function (frame) { return pooled(function () { return decode(key, frame) }) }))
        .then(function (results) {
          var failed = results.some(function (result) { return result.status === 'rejected' })
          var frames = results.filter(function (result) { return result.status === 'fulfilled' }).map(function (result) { return result.value })
          if (failed || disposed) {
            frames.forEach(close); entry.error = true
            if (!disposed) console.warn('[dsh-whale-pixel] Original PNG animation unavailable:', key)
          } else {
            entry.frames = frames
            entry.bytes = frames.reduce(function (sum, record) { return sum + record.bytes }, 0)
            bytes += entry.bytes; trim()
          }
          if (!disposed) options.onReady()
          return entry.frames
        })
      return entry.promise
    }
    function frame(key, index) {
      protectedKey = key
      var entry = entries.get(key)
      if (!entry) { ready(key); return null }
      if (!entry.frames) return null
      entries.delete(key); entries.set(key, entry)
      shownKey = key; trim()
      return entry.frames[index]
    }
    function paint(context, canvas, record) {
      var rect = canvas.getBoundingClientRect()
      var size = Math.max(1, Math.round(rect.width * (scope.devicePixelRatio || 1)))
      // A backing pixel maps to one physical display pixel; only one resampling pass.
      if (canvas.width !== size || canvas.height !== size) canvas.width = canvas.height = size
      context.imageSmoothingEnabled = false
      context.clearRect(0, 0, size, size)
      context.drawImage(record.image, 0, TOP / SIZE * size, size, HEIGHT / SIZE * size)
      canvas.style.clipPath = record.clip
    }
    function hit(record, rx, ry) {
      if (rx < 0 || ry < 0 || rx >= 1 || ry >= 1) return false
      if (!record.mask) return true // Canvas readback protection: bounded rectangle fallback.
      return !!record.mask[Math.floor(ry * SIZE) * SIZE + Math.min(SIZE - 1, Math.floor(rx * SIZE))]
    }
    function dispose() {
      disposed = true
      entries.forEach(function (entry) { if (entry.frames) entry.frames.forEach(close) })
      entries.clear(); bytes = 0
    }
    return { ready: ready, frame: frame, paint: paint, hit: hit, dispose: dispose,
      failed: function (key) { var entry = entries.get(key); return !!(entry && entry.error) },
      stats: function () { return { bytes: bytes, limit: maxBytes } } }
  }
  scope.DshWhalePixelRaster = Object.freeze({ create: create })
})(typeof globalThis === 'object' ? globalThis : window)
