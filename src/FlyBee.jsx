import { useEffect, useRef } from 'react'
import { Bee } from './icons'

// A little bee that chases the mouse, circles it when it stops, and wanders when the mouse rests.
export default function FlyBee() {
  const box = useRef(null)
  useEffect(() => {
    const mq = window.matchMedia?.('(hover: hover) and (pointer: fine)')
    if (!mq?.matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = box.current
    const m = { x: innerWidth * 0.6, y: innerHeight * 0.4, t: performance.now() }
    const b = { x: m.x - 120, y: m.y - 80, vx: 0, vy: 0, face: 1 }
    const onMove = (e) => { m.x = e.clientX; m.y = e.clientY; m.t = performance.now() }
    window.addEventListener('mousemove', onMove, { passive: true })
    let raf, last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const idle = (now - m.t) / 1000
      // target: near the cursor, orbiting loosely; drifting wider after the mouse rests
      const r = idle < 1.5 ? 46 : Math.min(150, 46 + (idle - 1.5) * 30)
      const a = now / (idle < 1.5 ? 420 : 900)
      const tx = m.x + Math.cos(a) * r + Math.sin(now / 1300) * 18
      const ty = m.y + Math.sin(a * 1.3) * r * 0.7 - 24
      const k = idle < 1.5 ? 38 : 14
      b.vx += (tx - b.x) * k * dt
      b.vy += (ty - b.y) * k * dt
      const damp = Math.exp(-6 * dt)
      b.vx *= damp
      b.vy *= damp
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (Math.abs(b.vx) > 25) b.face = b.vx > 0 ? 1 : -1
      const tilt = Math.max(-18, Math.min(18, b.vy * 0.04))
      el.style.transform = `translate(${b.x - 17}px, ${b.y - 14}px) scaleX(${b.face}) rotate(${tilt * b.face}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove) }
  }, [])
  return (
    <div className="fly-bee" ref={box} aria-hidden="true">
      <Bee size={34} />
    </div>
  )
}
