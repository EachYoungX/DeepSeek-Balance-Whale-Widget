import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { startWidgetServer } from './widget-server.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PIXEL_PLAYWRIGHT_PATH || 'playwright')
const app = await startWidgetServer()
let browser
try { browser = await chromium.launch({ headless: true }) }
catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }) }
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
const output = fileURLToPath(new URL('../.test-output/', import.meta.url))
await mkdir(output, { recursive: true })
async function action(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
async function animation(key, timeout = 5000) {
  await page.waitForFunction(key => document.querySelector('.dshwv-pixel')?.dataset.animation === key, key, { timeout })
}
async function point(side = 'left') {
  return page.evaluate(side => {
    const canvas = document.querySelector('.dshwv-pixel'), rect = canvas.getBoundingClientRect()
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    const flip = document.querySelector('.dshwv-root').classList.contains('dshwv-left')
    let chosen = null, score = Infinity
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 10) continue
      if (side === 'left' ? x >= canvas.width / 2 : x < canvas.width / 2) continue
      const distance = (x - canvas.width * (side === 'left' ? 0.35 : 0.65)) ** 2 + (y - canvas.height * 0.55) ** 2
      if (distance < score) { chosen = { x, y }; score = distance }
    }
    if (!chosen) throw new Error('No opaque hit point')
    return { x: rect.left + (flip ? canvas.width - chosen.x - 0.5 : chosen.x + 0.5) / canvas.width * rect.width,
      y: rect.top + (chosen.y + 0.5) / canvas.height * rect.height }
  }, side)
}
async function click(side = 'left') { const p = await point(side); await page.mouse.click(p.x, p.y) }
async function openMenu() {
  if (await page.locator('.dshwv-menu').evaluate(el => el.classList.contains('dshwv-menu-open'))) return
  if (await page.locator('.dshwv-menu-btn').isVisible()) await page.locator('.dshwv-menu-btn').click()
  else { const p = await point(); await page.mouse.click(p.x, p.y, { button: 'right' }) }
  await page.waitForFunction(() => document.querySelector('.dshwv-menu').classList.contains('dshwv-menu-open'))
}

try {
  await page.goto(app.url)
  await action('real plugin boots with local frames and a visible pixel canvas', async () => {
    await page.waitForSelector('.dshwv-pixel', { state: 'visible' })
    assert.equal(await page.locator('.dshwv-pixel').evaluate(el => getComputedStyle(el).imageRendering), 'pixelated')
    const response = await page.request.get(app.url + '/dsh-whale/pixel-frames.json')
    assert.equal(response.status(), 200)
    assert.equal((await response.json()).animations.length, 22)
  })
  await page.screenshot({ path: output + 'pixel-browser.png', fullPage: true })
  await action('directional click interrupts hover and resumes after one-shot', async () => {
    await click('left'); await animation('poke-left')
    await page.mouse.move(10, 10)
  })
  await action('host thinking, text stream and compression reach the renderer', async () => {
    app.emit('session/event', { id: 'test' }, { type: 'turn/start', data: {} })
    await animation('thinking')
    app.emit('agent/assistant-stream', { agent: { session: { id: 'test' } }, frame: { type: 'chunk', chunk: { type: 'text-delta', text: 'test' } } })
    await animation('typing')
    app.emit('session/event', { id: 'test' }, { type: 'compaction/start', data: {} })
    await animation('compacting')
  })
  await action('question/approval waits and two child agents choose matching actions', async () => {
    app.emit('session/event', { id: 'test' }, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'q' } })
    await animation('notification')
    app.emit('session/event', { id: 'test' }, { type: 'tool/result', data: { message: { callId: 'q' } } })
    app.emit('session/event', { id: 'test' }, { type: 'approval/asked', data: { id: 'a' } })
    await animation('notification')
    app.emit('session/event', { id: 'test' }, { type: 'approval/decided', data: { id: 'a' } })
    app.emit('subagent/start', { id: 'child1' }); app.emit('subagent/start', { id: 'child2' })
    await animation('conducting')
    app.emit('subagent/end', { id: 'child1' }); app.emit('subagent/end', { id: 'child2' })
    app.emit('session/event', { id: 'test' }, { type: 'turn/end', data: { reason: { kind: 'error' } } })
    await animation('error')
  })
  await action('drag uses dynamic opaque hit testing and clears on pointer release', async () => {
    const p = await point()
    await page.mouse.move(p.x, p.y); await page.mouse.down()
    await page.mouse.move(p.x - 70, p.y - 80, { steps: 5 }); await animation('drag')
    await page.mouse.up()
    await page.waitForFunction(() => document.querySelector('.dshwv-pixel').dataset.animation !== 'drag')
    await page.mouse.move(10, 10)
  })
  await action('idle polls do not prevent sleep; user interaction wakes the character', async () => {
    await animation('sleeping', 16_000)
    // Touch down directly so mouseenter cannot consume the wake before the click.
    const p = await point()
    await page.dispatchEvent('.dshwv-pixel', 'pointerdown', { clientX: p.x, clientY: p.y, button: 0, pointerType: 'mouse' })
    await animation('waking')
    await page.dispatchEvent('.dshwv-pixel', 'pointerup', { clientX: p.x, clientY: p.y, button: 0, pointerType: 'mouse' })
    await page.mouse.move(10, 10)
  })
  await action('pixel switch restores the original image and persists across reload', async () => {
    await openMenu(); await page.locator('.dshwv-pixel-toggle').click()
    assert.equal(await page.locator('.dshwv-pixel').isVisible(), false)
    assert.equal(await page.locator('img.dshwv-img').evaluate(el => getComputedStyle(el).visibility), 'visible')
    await page.reload(); await page.waitForSelector('.dshwv-root')
    assert.equal(await page.locator('.dshwv-pixel').isVisible(), false)
    await openMenu(); await page.locator('.dshwv-pixel-toggle').click()
    await page.waitForSelector('.dshwv-pixel', { state: 'visible' })
  })
  await action('custom roles keep the original image path and default role restores animation', async () => {
    await page.locator('.dshwv-rolebtn').click()
    await page.locator('.dshwv-roleitem').filter({ hasText: '测试自定义角色' }).click()
    assert.equal(await page.locator('.dshwv-pixel').isVisible(), false)
    await page.locator('.dshwv-rolebtn').click()
    await page.locator('.dshwv-roleitem').filter({ hasText: '小鲸鱼' }).click()
    await page.waitForSelector('.dshwv-pixel', { state: 'visible' })
  })
  await action('mobile viewport retains a visible, interactive character', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(300)
    const rect = await page.locator('.dshwv-pixel').boundingBox()
    assert.ok(rect && rect.width > 30 && rect.x + rect.width > 0 && rect.x < 390 && rect.y < 844)
    await page.screenshot({ path: output + 'pixel-mobile.png', fullPage: true })
  })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ checks: checks.length, pageErrors: errors.length, screenshot: output + 'pixel-browser.png' }))
} catch (error) {
  await page.screenshot({ path: output + 'pixel-failure.png', fullPage: true }).catch(() => {})
  console.error('Browser page errors:', errors)
  throw error
} finally { await browser.close(); await app.close() }
