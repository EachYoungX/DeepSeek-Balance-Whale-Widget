import http from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

// Runs the real plugin against an isolated host. No API key or user profile is read.
export async function startWidgetServer(port = 0) {
  const dataRoot = path.join(root, '.test-output', `profile-${process.pid}`)
  await mkdir(dataRoot, { recursive: true })
  process.env.DSH_HOME = dataRoot
  const { default: plugin } = await import('../lib/index.js')
  const routes = [], listeners = new Map(), disposers = [], taps = []
  const fixture = { balance: 100, balanceError: false, pending: null }
  const connection = { requestRejection: () => null }
  const ctx = {
    connection, credentials: { resolve: async () => null },
    get(name) { return name === 'connection' ? connection : null },
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(callback)
      return () => listeners.get(name).delete(callback)
    },
    effect(callback) { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose) },
    inject(_names, callback) { callback(ctx) },
    webServer: {
      register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) },
      tapIndex(callback) { taps.push(callback); return () => {} },
    },
  }
  function emit(name, ...args) { for (const callback of listeners.get(name) || []) callback(...args) }
  plugin.apply(ctx)
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    try {
      if (url.pathname === '/') {
        let html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>鲸娘像素动画 · 本地验收</title>' +
          '<style>body{margin:0;background:#f3f6fc;color:#25304c;font:16px system-ui;padding:48px}main{max-width:780px;margin:auto}textarea{box-sizing:border-box;width:100%;height:130px;padding:20px;border:1px solid #c2cfe8;border-radius:16px;font:inherit}p{line-height:1.8}small{color:#6c7890}</style>' +
          '<main id="root"><small>本地验收 · 模拟余额与会话事件</small><h1>鲸娘像素动画</h1><p>右下角角色使用插件真实客户端。点击、拖拽、等待十秒入睡，或打开菜单切换像素动画和自定义角色。</p><textarea placeholder="用于挂件识别聊天界面的模拟输入框"></textarea><p>测试余额：100 CNY。此页面与真实账户、会话和凭据分开。</p></main></html>'
        for (const tap of taps) html = tap(html)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return
      }
      if (url.pathname === '/__test/events' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk
        const data = JSON.parse(body)
        if (data.fixture) Object.assign(fixture, data.fixture)
        else emit(data.name, ...(data.args || []))
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return
      }
      if (url.pathname === '/dsh-whale/balance.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(fixture.balanceError ? { ok: false, error: '模拟网络错误' } : {
          ok: true, totalBalance: fixture.balance, currency: 'CNY', todayUsage: 1.25, todayUsageCurrency: 'CNY', version: '0.4.2-pixel.1', isPeak: false,
        })); return
      }
      if (url.pathname === '/dsh-whale/roles.json' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, roles: [
          { id: 'default', name: '小鲸鱼', url: '/dsh-whale/image.png' },
          { id: 'fixture', name: '测试自定义角色', url: '/__test/role.png' },
        ] })); return
      }
      if (url.pathname === '/__test/role.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(await readFile(path.join(root, 'assets', 'DSniang1.png'))); return
      }
      const route = routes.find(route => route.kind === 'prefix' ? url.pathname.startsWith(route.path) : url.pathname === route.path)
      if (route) { await route.handler(req, res); return }
      res.writeHead(404); res.end('Not found')
    } catch (error) { console.error(error); res.writeHead(500); res.end('Fixture error') }
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`, emit, fixture,
    async close() { for (const dispose of disposers.reverse()) dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) },
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const app = await startWidgetServer(Number(process.env.PORT) || 3081)
  console.log(`Pixel preview: ${app.url}`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0) })
}
