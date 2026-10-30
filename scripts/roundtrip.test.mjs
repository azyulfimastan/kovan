import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window; globalThis.document = dom.window.document
for (const k of ['Node','HTMLElement','Element','DocumentFragment','DOMParser','navigator','getComputedStyle']) { try { globalThis[k] ??= dom.window[k] } catch {} }
const { mdToJSON, docToMd } = await import('/root/kovan/src/lib/rich.js')
const cases = [
 'Kovan işleri sade tutar.\n\n## Dene\n- [ ] Beni işaretle — kutucuğa dokun\n- [x] Başlık, liste ve fazlası için / yaz\n- [ ] Notları [[Fikirler]] gibi birbirine bağla\n\nİyi eğlenceler!',
 '# Başlık\n\nsatır bir\nsatır iki **kalın** ve *italik* ve ~~çizik~~ `kod` [link](https://a.com)\n\n1. bir\n2. iki\n   - iç içe\n\n> alıntı\n\n```js\nconst a = 1\n```\n\n---\n\n![](https://x.com/a.jpg)',
 'snake_case 2*3=6 <b>not html</b> # not heading\n- madde',
]
for (const c of cases) {
  const j = mdToJSON(c)
  const out = docToMd(j)
  const again = docToMd(mdToJSON(out))
  console.log('-----\n'+out+'\n== stable:', again === out)
}
