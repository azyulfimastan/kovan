// Visual snapshot of the main screens, to check that a style refactor changes nothing.
//   node tests/visual.cjs <outDir>          (needs a built ./dist)
//   python3 tests/visual_diff.py <dirA> <dirB>
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const OUT = path.resolve(process.argv[2] || 'visual-out')
const DIST = path.join(__dirname, '..', 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
.fly-bee,.swarm,.swarm-shield,.bee-orbit{display:none!important}`

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const server = http.createServer((req, res) => {
    let file = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://localhost:${server.address().port}/`
  const browser = await chromium.launch()

  const variants = [
    ['desk-light', { viewport: { width: 1280, height: 800 }, colorScheme: 'light' }],
    ['desk-dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }],
    ['mob-light', { viewport: { width: 390, height: 780 }, colorScheme: 'light', isMobile: true, hasTouch: true }],
    ['mob-dark', { viewport: { width: 390, height: 780 }, colorScheme: 'dark', isMobile: true, hasTouch: true }],
  ]
  for (const [name, opts] of variants) {
    const ctx = await browser.newContext({ ...opts, locale: 'tr-TR', serviceWorkers: 'block', reducedMotion: 'reduce' })
    await ctx.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'))
    const page = await ctx.newPage()
    const mob = name.startsWith('mob')
    const shot = async (label) => {
      await page.addStyleTag({ content: FREEZE })
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(OUT, `${name}-${label}.png`) })
    }
    await page.goto(base)
    await page.addStyleTag({ content: FREEZE })
    await page.locator('.card').first().waitFor()
    await shot('01-home')

    // data: a folder and a rich note
    if (mob) await page.locator('.tabbar button').last().click()
    await page.locator('.add-folder').click()
    await page.keyboard.type('İş fikirleri')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    if (mob) {
      if (await page.locator('.shell.side-open').count()) await page.locator('.scrim').click({ force: true, position: { x: 380, y: 300 } })
      await page.locator('.fab').click()
    } else await page.locator('.side-new').click()
    await page.locator('.ed-title').fill('Haftalık plan ve fikirler')
    await page.locator('.ProseMirror').click()
    for (const line of ['## Bu hafta', 'Uzun bir paragraf: satır kaydırma, aralıklar ve **kalın** yazı görünsün diye biraz uzun yazıyorum.', '[] yapılacak bir iş', 'bir tane daha']) {
      await page.keyboard.type(line)
      await page.keyboard.press('Enter')
    }
    await page.keyboard.press('Enter')
    await page.keyboard.type('> bir alıntı')
    await page.waitForTimeout(600)
    await shot('02-note')

    // list with folder chip
    if (mob) await page.locator('.ed-close').click()
    await page.waitForTimeout(200)
    await shot('03-list')

    // select mode
    await page.locator('.sel-toggle').click()
    await page.locator('.bulk-all').click()
    await shot('04-select')
    await page.locator('.sel-toggle').click()

    // right-click / long-press menu (desktop) and folder menu
    if (!mob) {
      await page.locator('.card').first().click({ button: 'right' })
      await shot('05-ctx')
      await page.mouse.click(5, 5)
      await page.locator('.title-btn').click()
      await shot('06-folder-menu')
      await page.keyboard.press('Escape')
      await page.mouse.click(700, 700)
    }

    // board and trash
    if (mob) await page.locator('.tabbar button').nth(2).click()
    else await page.locator('.side .nav button', { hasText: 'Pano' }).click()
    await page.waitForTimeout(300)
    await shot('07-board')
    if (mob) {
      await page.locator('.tabbar button').last().click()
      await shot('08-menu')
    }
    await page.locator('.side .nav button', { hasText: 'Çöp' }).click()
    await page.waitForTimeout(300)
    await shot('09-trash')
    await ctx.close()
  }
  await browser.close()
  server.close()
  console.log('saved to', OUT)
})()
