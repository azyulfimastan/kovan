// Browser tests (local mode, no Supabase needed). Run with: npm test
// They build nothing themselves: `npm test` builds first, then serves ./dist here.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const DIST = path.join(__dirname, '..', 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }
let server, base, browser

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(DIST, p)
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', ...opts })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base)
  await page.locator('.card').first().waitFor()
  return { ctx, page, errors }
}
const titles = (page) => page.locator('.card strong').allInnerTexts()
async function newNote(page, title, body = '') {
  await page.locator('.side-new').click()
  await page.locator('.ed-title').fill(title)
  if (body) {
    await page.locator('.ProseMirror').click()
    await page.keyboard.type(body)
  }
  await page.waitForTimeout(500)
}

test('loads, creates a note, Enter in the title moves to the text', async () => {
  const { ctx, page, errors } = await open()
  await page.locator('.side-new').click()
  await page.waitForFunction(() => document.activeElement?.classList.contains('ed-title'))
  await page.keyboard.type('Title')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
  await page.keyboard.type('body text')
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.ed-title').inputValue(), 'Title')
  assert.match(await page.locator('.ProseMirror').innerText(), /body text/)
  assert.deepEqual(errors, [])
  await ctx.close()
})

test('folders: move a note, folder chip shows in All notes', async () => {
  const { ctx, page } = await open()
  await page.locator('.add-folder').click()
  await page.keyboard.type('Ideas')
  await page.keyboard.press('Enter')
  await newNote(page, 'In a folder', 'x')
  await page.locator('.folder-chip select').selectOption({ label: 'Ideas' })
  await page.waitForTimeout(300)
  await page.locator('.nav button', { hasText: 'All notes' }).first().click()
  await page.waitForTimeout(300)
  assert.ok((await page.locator('.card-folder').allInnerTexts()).includes('Ideas'))
  await ctx.close()
})

test('sort button reverses the list', async () => {
  const { ctx, page } = await open()
  await newNote(page, 'First')
  await newNote(page, 'Second')
  const a = await titles(page)
  await page.locator('.sort-toggle').click()
  await page.waitForTimeout(200)
  assert.deepEqual(await titles(page), [...a].reverse())
  await ctx.close()
})

test('multi-select: select all, delete, undo', async () => {
  const { ctx, page } = await open()
  await newNote(page, 'One')
  await newNote(page, 'Two')
  const n = await page.locator('.card').count()
  await page.locator('.sel-toggle').click()
  await page.locator('.bulk-all').click()
  await page.locator('.bulk-act.danger').click()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('.card').count(), 0)
  await page.locator('.toast button').click()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('.card').count(), n)
  await ctx.close()
})

test('undo/redo: each Enter is one step', async () => {
  const { ctx, page } = await open()
  await page.locator('.side-new').click()
  await page.locator('.ProseMirror').click()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.type('line ' + i)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(40)
  }
  const before = await page.locator('.ProseMirror p').count()
  await page.keyboard.press('Control+z')
  assert.equal(await page.locator('.ProseMirror p').count(), before - 1)
  await page.keyboard.press('Control+y')
  assert.equal(await page.locator('.ProseMirror p').count(), before)
  await ctx.close()
})

test('room ZIP download is a valid archive with the notes', async () => {
  const { ctx, page } = await open({ acceptDownloads: true })
  await newNote(page, 'Zip me: A?', 'hello')
  await page.locator('.ws-more').click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.ctx-menu button', { hasText: 'ZIP' }).click()])
  const buf = fs.readFileSync(await dl.path())
  assert.equal(buf.subarray(0, 2).toString(), 'PK')
  assert.ok(buf.includes(Buffer.from('Zip me A.md')))
  await ctx.close()
})

test('phone Back closes the open note instead of leaving', async () => {
  const { ctx, page } = await open({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true })
  await page.locator('.card').first().click()
  await page.locator('.ProseMirror').waitFor()
  await page.goBack()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('.ProseMirror').count(), 0)
  assert.equal(new URL(page.url()).origin, new URL(base).origin)
  await ctx.close()
})

test('empty note placeholder is not squeezed (no overlapping lines)', async () => {
  const { ctx, page } = await open({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true })
  await page.locator('.fab').click()
  const lh = await page.locator('.ProseMirror p').first().evaluate((p) => getComputedStyle(p).lineHeight)
  assert.notEqual(lh, '0.7')
  assert.ok(!/^\d+(\.\d+)?px$/.test(lh) || parseFloat(lh) > 14)
  await ctx.close()
})

test('works offline after the first visit (app and editor cached)', async () => {
  const { ctx, page } = await open()
  await page.waitForTimeout(1500)
  await page.reload()
  await page.locator('.card').first().click()
  await page.locator('.ProseMirror').waitFor()
  await page.waitForTimeout(1000)
  await ctx.setOffline(true)
  await page.reload()
  await page.locator('.card').first().click()
  await page.locator('.ProseMirror').waitFor({ timeout: 5000 })
  await ctx.close()
})
