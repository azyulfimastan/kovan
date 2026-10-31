import { useEffect, useRef, useState } from 'react'
import { Bee } from './icons'

const N = 1200 // bees on the first tap
const STEP = 100 // more bees every second
const SECS = 10
const rnd = (a, b) => a + Math.random() * (b - a)
const newBee = (m) => {
  const a = rnd(0, Math.PI * 2), v = rnd(300, 800)
  return { x: m.x, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rnd(500, 950), face: 1 }
}

// Lightweight bee for the swarm (no gradients/clip paths/ids, so hundreds stay smooth).
const MiniBee = () => (
  <svg width="24" height="19" viewBox="0 0 64 51" aria-hidden="true">
    <ellipse cx="26" cy="13" rx="9" ry="13" fill="#fff" fillOpacity=".8" stroke="#2a1d08" strokeOpacity=".5" strokeWidth="2" transform="rotate(-20 26 13)" />
    <ellipse cx="28" cy="32" rx="19" ry="13" fill="#f2b632" stroke="#2a1d08" strokeWidth="3" />
    <path d="M19 20v24M30 19v26" stroke="#2a1d08" strokeWidth="6" strokeLinecap="round" />
    <circle cx="52" cy="30" r="9" fill="#2a1d08" />
  </svg>
)

// One bee wanders around the screen. Touch it: for 5 seconds a nervous swarm erupts from it.
export default function FlyBee() {
  const mainEl = useRef(null)
  const swarmEls = useRef([])
  const [count, setCount] = useState(0)
  const st = useRef({ active: false, bees: [], until: 0, main: null })
  const [ok] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (!ok) return
    const W = () => innerWidth, H = () => innerHeight
    const m = { x: rnd(80, W() - 80), y: rnd(80, H() - 80), vx: 0, vy: 0, tx: 0, ty: 0, next: 0, face: 1 }
    st.current.main = m
    let raf, last = performance.now()
    const pick = (now) => {
      m.tx = rnd(40, W() - 60)
      m.ty = rnd(70, H() - 90)
      m.next = now + rnd(1800, 4200)
    }
    pick(last)
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (now > m.next) pick(now)
      m.vx += ((m.tx - m.x) * 1.6 + Math.sin(now / 370) * 60) * dt
      m.vy += ((m.ty - m.y) * 1.6 + Math.cos(now / 290) * 60) * dt
      const damp = Math.exp(-1.8 * dt)
      m.vx *= damp; m.vy *= damp
      m.x += m.vx * dt; m.y += m.vy * dt
      if (Math.abs(m.vx) > 14) m.face = m.vx > 0 ? 1 : -1
      if (mainEl.current) mainEl.current.style.transform = `translate(${m.x - 17}px, ${m.y - 14}px) scaleX(${m.face}) rotate(${Math.max(-14, Math.min(14, m.vy * 0.05)) * m.face}deg)`
      const s = st.current
      if (s.active) {
        const left = s.until - now
        const want = N + STEP * Math.min(SECS - 1, Math.floor((now - s.start) / 1000))
        if (want > s.bees.length && left > 0) {
          const src = s.main
          while (s.bees.length < want) s.bees.push(newBee(src))
          setCount(s.bees.length)
        }
        s.bees.forEach((b, i) => {
          const el = swarmEls.current[i]
          if (!el) return
          // nervous: constant random kicks, high speed, bounce off the edges
          b.vx += rnd(-1, 1) * 2600 * dt
          b.vy += rnd(-1, 1) * 2600 * dt
          const sp = Math.hypot(b.vx, b.vy)
          if (sp > b.max) { b.vx *= b.max / sp; b.vy *= b.max / sp }
          b.x += b.vx * dt; b.y += b.vy * dt
          // steer away from the edges smoothly instead of bouncing off them
          const M = 90
          if (b.x < M) b.vx += (M - b.x) * 40 * dt
          if (b.x > W() - M) b.vx -= (b.x - (W() - M)) * 40 * dt
          if (b.y < M) b.vy += (M - b.y) * 40 * dt
          if (b.y > H() - M) b.vy -= (b.y - (H() - M)) * 40 * dt
          b.x = Math.max(-10, Math.min(W() - 14, b.x))
          b.y = Math.max(-10, Math.min(H() - 14, b.y))
          if (Math.abs(b.vx) > 40) b.face = b.vx > 0 ? 1 : -1
          const wob = Math.sin(now / 40 + i) * 8
          el.style.transform = `translate(${b.x - 12}px, ${b.y - 10}px) scaleX(${b.face}) rotate(${Math.max(-40, Math.min(40, b.vy * 0.08)) * b.face + wob}deg)`
          el.style.opacity = left < 600 ? String(Math.max(0, left / 600)) : '1'
        })
        if (left <= 0) {
          s.active = false
          s.bees = []
          setCount(0)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ok])

  function burst() {
    const s = st.current
    if (!s.main || s.active) return
    s.bees = Array.from({ length: N }, () => newBee(s.main))
    s.start = performance.now()
    s.until = s.start + SECS * 1000
    s.active = true
    setCount(s.bees.length)
    navigator.vibrate?.(20)
  }

  if (!ok) return null
  return (
    <>
      <div className="fly-bee lead" ref={mainEl} onClick={() => burst()} role="button" aria-label="bee">
        <Bee size={34} />
      </div>
      {count > 0 && <div className="swarm-shield" />}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="fly-bee swarm" ref={(el) => (swarmEls.current[i] = el)}>
          <MiniBee />
        </div>
      ))}
    </>
  )
}
