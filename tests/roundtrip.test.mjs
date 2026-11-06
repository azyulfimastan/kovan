// Markdown <-> editor round trip: what we save must load back to the same text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
for (const k of ['Node', 'HTMLElement', 'Element', 'DocumentFragment', 'DOMParser', 'navigator', 'getComputedStyle']) {
  try {
    globalThis[k] ??= dom.window[k]
  } catch {}
}
const { mdToJSON, docToMd } = await import('../src/lib/rich.js')

const cases = [
  'Kovan işleri sade tutar.\n\n## Dene\n- [ ] Beni işaretle — kutucuğa dokun\n- [x] Başlık, liste ve fazlası için / yaz\n- [ ] Notları [[Fikirler]] gibi birbirine bağla\n\nİyi eğlenceler!',
  '# Başlık\n\nsatır bir\nsatır iki **kalın** ve *italik* ve ~~çizik~~ `kod` [link](https://a.com)\n\n1. bir\n2. iki\n   - iç içe\n\n> alıntı\n\n```js\nconst a = 1\n```\n\n---\n\n![](https://x.com/a.jpg)',
  'snake_case 2*3=6 <b>not html</b> # not heading\n- madde',
  '1. [https://youtu.be/x](https://youtu.be/x)\n   <span style="font-size:11px">Video başlığı</span>',
]

for (const [i, c] of cases.entries()) {
  test(`round trip ${i + 1}`, () => {
    const out = docToMd(mdToJSON(c))
    assert.equal(docToMd(mdToJSON(out)), out)
  })
}
