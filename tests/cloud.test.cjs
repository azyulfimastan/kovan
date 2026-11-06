// Browser tests for the signed-in (Supabase) app, against an in-memory fake Supabase.
// npm run test:cloud builds ./dist-mock with VITE_SUPABASE_URL=https://mock.supabase.test first.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { installCloudMock } = require('./cloud-mock.cjs')

const DIST = path.join(__dirname, '..', 'dist-mock')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
let server, base, browser

before(async () => {
  server = http.createServer((req, res) => {
    let file = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://localhost:${server.address().port}/`
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
  server?.close()
})

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', serviceWorkers: 'block', ...opts })
  const db = await installCloudMock(ctx)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base)
  await page.locator('.room-tile:not(.add)').first().waitFor()
  await page.locator('.usage').waitFor()
  await page.waitForTimeout(400) // menu slide-in
  return { ctx, page, db, errors }
}

test('signed-in screen: room, members, storage bar, credit', async () => {
  const { ctx, page, errors } = await open()
  assert.equal(await page.locator('.room-tile:not(.add)').count(), 1)
  assert.match(await page.locator('.usage').innerText(), /KB \/ 300 MB/)
  assert.match(await page.locator('.side .credit').innerText(), /Ahmet Kula/)
  assert.equal(await page.locator('.danger-ico').count(), 1)
  assert.deepEqual(errors, [])
  await ctx.close()
})

test('a new note is created on the server and its text is saved', async () => {
  const { ctx, page, db } = await open()
  await page.locator('.side-new').click()
  await page.waitForFunction(() => document.activeElement?.classList.contains('ed-title'))
  await page.keyboard.type('Server note')
  await page.keyboard.press('Enter')
  await page.locator('.ProseMirror').waitFor()
  await page.keyboard.type('saved text')
  await page.waitForTimeout(1500)
  const n = db.notes.find((x) => x.title === 'Server note')
  assert.ok(n, 'note row created')
  assert.match(n.body, /saved text/)
  await ctx.close()
})

test('note menu has History (cloud only) and it opens', async () => {
  const { ctx, page } = await open()
  await page.locator('.side-new').click()
  await page.locator('.ed-title').fill('With history')
  await page.waitForTimeout(800)
  await page.locator('.ed-bar .icon-btn').last().click()
  await page.locator('.more-menu button, .ed-more button', { hasText: 'History' }).first().click()
  await page.locator('.hist-dlg', { hasText: 'No earlier versions' }).waitFor({ timeout: 15000 })
  await ctx.close()
})

test('new room dialog creates a room', async () => {
  const { ctx, page, db } = await open()
  await page.locator('.room-tile.add').click()
  await page.keyboard.type('Second room')
  await page.locator('.dialog input[type=checkbox]').uncheck()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  assert.ok(db.workspaces.some((w) => w.name === 'Second room'))
  await ctx.close()
})

test('delete account needs the e-mail typed first', async () => {
  const { ctx, page } = await open()
  await page.locator('.danger-ico').click()
  const go = page.locator('.dialog .btn.danger')
  assert.equal(await go.isDisabled(), true)
  await page.locator('.dialog input').fill('ahmet@example.com')
  assert.equal(await go.isDisabled(), false)
  await page.locator('.dialog .btn:not(.danger)').click()
  assert.equal(await page.locator('.dialog').count(), 0)
  await ctx.close()
})

test('room menu offers ZIP download and delete', async () => {
  const { ctx, page } = await open()
  await page.locator('.room-tile:not(.add)').first().click({ button: 'right' })
  const items = await page.locator('.ctx-menu button').allInnerTexts()
  assert.ok(items.some((s) => /ZIP/.test(s)))
  assert.ok(items.some((s) => /Delete room|Leave/i.test(s)))
  await ctx.close()
})

test('desktop layout: menu and list side by side', async () => {
  const { ctx, page } = await open()
  const x = await page.locator('.list').evaluate((el) => el.getBoundingClientRect().x)
  assert.equal(Math.round(x), 256)
  await ctx.close()
})
