// Push notifications in the browser: turn on/off for this device.
import { store } from '../store.js'

export const VAPID_PUBLIC = 'BLHmceZO3vBLyN8BhIM73Hi6cnMhAvTL9BYm8YRSBWavGaeZPtJbdyycZnD-HB9cExar60m_hsXEefSzwzlqJDA'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const toKey = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function reg(wait) {
  const r = await navigator.serviceWorker.getRegistration()
  if (r || !wait) return r
  return Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(() => ok(null), 5000))])
}

// 'unsupported' | 'denied' | 'on' | 'off'
export async function pushState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await (await reg(false))?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

const save = (sub) => {
  const j = sub.toJSON()
  return store.pushSubscribe(j.endpoint, j.keys.p256dh, j.keys.auth)
}

export async function enablePush() {
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const r = await reg(true)
  if (!r) throw new Error('no service worker')
  const sub = (await r.pushManager.getSubscription()) || (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) }))
  await save(sub)
  return 'on'
}

export async function disablePush() {
  const sub = pushSupported() && (await (await reg(false))?.pushManager.getSubscription())
  if (sub) {
    await store.pushUnsubscribe(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  return pushSupported() ? 'off' : 'unsupported'
}

// after sign-in: make sure this device's subscription belongs to the signed-in account
export async function refreshPush() {
  const sub = pushSupported() && Notification.permission === 'granted' && (await (await reg(false))?.pushManager.getSubscription())
  if (sub) await save(sub).catch(() => {})
}
