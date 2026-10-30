import { useMemo, useState } from 'react'
import { useI18n } from './i18n'
import { extractLinks, norm } from './lib/md'

const W = 900
const H = 600

function layout(n, edges) {
  const pos = Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / Math.max(n, 1)
    return { x: W / 2 + Math.cos(a) * 220, y: H / 2 + Math.sin(a) * 160, vx: 0, vy: 0 }
  })
  const steps = 320
  for (let it = 0; it < steps; it++) {
    const k = 1 - it / steps
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x
        let dy = pos[i].y - pos[j].y
        const d2 = dx * dx + dy * dy + 0.01
        const d = Math.sqrt(d2)
        const f = 2800 / d2
        dx /= d
        dy /= d
        pos[i].vx += dx * f
        pos[i].vy += dy * f
        pos[j].vx -= dx * f
        pos[j].vy -= dy * f
      }
    }
    for (const [a, b] of edges) {
      const dx = pos[b].x - pos[a].x
      const dy = pos[b].y - pos[a].y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - 95) * 0.03
      pos[a].vx += (dx / d) * f
      pos[a].vy += (dy / d) * f
      pos[b].vx -= (dx / d) * f
      pos[b].vy -= (dy / d) * f
    }
    for (const p of pos) {
      p.vx += (W / 2 - p.x) * 0.006
      p.vy += (H / 2 - p.y) * 0.006
      p.x += Math.max(-9, Math.min(9, p.vx)) * k
      p.y += Math.max(-9, Math.min(9, p.vy)) * k
      p.vx *= 0.6
      p.vy *= 0.6
    }
  }
  return pos
}

const hex = (cx, cy, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')

export default function Graph({ notes, activeId, onOpen }) {
  const { t } = useI18n()
  const [hover, setHover] = useState(null)

  const data = useMemo(() => {
    const byTitle = new Map()
    notes.forEach((n, i) => {
      if (n.title) byTitle.set(norm(n.title), i)
    })
    const set = new Set()
    const edges = []
    notes.forEach((n, i) => {
      for (const l of extractLinks(n.body)) {
        const j = byTitle.get(norm(l))
        if (j !== undefined && j !== i) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`
          if (!set.has(key)) {
            set.add(key)
            edges.push([i, j])
          }
        }
      }
    })
    const deg = new Array(notes.length).fill(0)
    edges.forEach(([a, b]) => {
      deg[a]++
      deg[b]++
    })
    const pos = layout(notes.length, edges)
    // fit the view to the nodes (with a sensible minimum so a few notes don't look huge)
    let vb = `0 0 ${W} ${H}`
    if (pos.length) {
      const xs = pos.map((p) => p.x)
      const ys = pos.map((p) => p.y)
      const pad = 80
      let w = Math.max(...xs) - Math.min(...xs) + pad * 2
      let h = Math.max(...ys) - Math.min(...ys) + pad * 2
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2
      w = Math.max(w, 460)
      h = Math.max(h, 320)
      vb = `${cx - w / 2} ${cy - h / 2} ${w} ${h}`
    }
    return { edges, deg, pos, vb }
  }, [notes])

  const linked = hover == null ? null : new Set([hover, ...data.edges.filter((e) => e.includes(hover)).flat()])

  return (
    <div className="graph">
      <svg viewBox={data.vb} role="img" aria-label={t('graph')}>
        {data.edges.map(([a, b], i) => {
          const dim = linked && !(linked.has(a) && linked.has(b) && (a === hover || b === hover))
          return (
            <line
              key={i}
              x1={data.pos[a].x}
              y1={data.pos[a].y}
              x2={data.pos[b].x}
              y2={data.pos[b].y}
              className={`g-edge ${dim ? 'dim' : ''}`}
            />
          )
        })}
        {notes.map((n, i) => {
          const p = data.pos[i]
          const r = 11 + Math.min(data.deg[i], 6) * 2.2
          const dim = linked && !linked.has(i)
          return (
            <g
              key={n.id}
              className={`g-node ${n.id === activeId ? 'active' : ''} ${dim ? 'dim' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onOpen(n.id)}
            >
              <polygon points={hex(p.x, p.y, r)} />
              <text x={p.x} y={p.y + r + 14} textAnchor="middle">
                {(n.title || t('untitled')).slice(0, 26)}
              </text>
            </g>
          )
        })}
      </svg>
      {data.edges.length === 0 && <p className="graph-hint">{t('graphEmpty')}</p>}
    </div>
  )
}
