import { useEffect, useState } from 'react'
import { store } from './store'

const fmt = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B')
const day = (d) => (d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

// Hidden page at /#admin. Anyone else is bounced to the normal app; the data call itself is
// refused by the database unless the signed-in e-mail is the owner's.
export default function Admin() {
  const [rows, setRows] = useState(null)
  const [rooms, setRooms] = useState([])
  const [flags, setFlags] = useState({})
  const [bans, setBans] = useState([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const load = () => {
    store.adminRooms().then(setRooms).catch(() => {})
    store.adminBannedEmails().then(setBans).catch(() => {})
    store.adminUsers().then((u) => setFlags(Object.fromEntries(u.map((x) => [x.user_id, x])))).catch(() => {})
    return store.adminOverview().then(setRows)
  }
  const act = async (r, kind) => {
    const who = r.email
    if (kind === 'delete' && !window.confirm(`${who}\n\nBu kullanıcı KALICI olarak silinsin ve e-postası banlansın mı? (Aynı e-postayla bir daha kayıt olamaz. Sahibi olduğu ve başka üyesi olmayan odalar da silinir.)`)) return
    if (kind === 'ban' && !window.confirm(`${who} banlansın mı? Giriş yapamaz.`)) return
    setBusy(r.user_id)
    try {
      if (kind === 'delete') await store.adminDeleteUser(r.user_id)
      else await store.adminSetBan(r.user_id, kind === 'ban')
      await load()
    } catch (e) {
      window.alert(e.message || String(e))
    }
    setBusy('')
  }
  useEffect(() => {
    load().catch((e) => {
      // not the owner -> look like nothing is here; anything else -> show why
      if (!e || e.code === '42501' || /not allowed|cloud only/.test(e.message || '')) window.location.replace('/')
      else setErr(`${e.code || ''} ${e.message || e}`)
    })
  }, [])
  if (err) return <pre style={{ padding: 24, color: '#b00020', whiteSpace: 'pre-wrap' }}>{err}</pre>
  if (!rows) return null
  const total = rows.reduce((a, r) => a + Number(r.text_bytes) + Number(r.image_bytes), 0)
  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: '#0b1226', color: '#f3f5fb', fontFamily: 'inherit' }}><div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <p style={{ color: '#c9d2ee' }}>{rows.length} kullanıcı · {rooms.length} oda · {rooms.reduce((a, r) => a + Number(r.notes), 0)} not · toplam {fmt(total)}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#e6c36a' }}>
              {['E-posta', 'Kayıt', 'Son giriş', 'Oda', 'Odalardaki not', 'Yazdığı not', 'Metin', 'Resim', 'Toplam', ''].map((h) => <th key={h} style={{ padding: '8px 10px' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} style={{ borderTop: '1px solid rgba(255,255,255,.18)' }}>
                <td style={{ padding: '8px 10px' }}>{r.email}{flags[r.user_id]?.banned && <b style={{ color: '#ff7b7b', marginLeft: 8 }}>BANLI</b>}</td>
                <td style={{ padding: '8px 10px' }}>{day(r.created_at)}</td>
                <td style={{ padding: '8px 10px' }}>{day(r.last_sign_in)}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{rooms.filter((x) => x.owner_email === r.email).length}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{rooms.filter((x) => x.owner_email === r.email).reduce((a, x) => a + Number(x.notes), 0)}</td>
                <td style={{ padding: '8px 10px' }}>{r.notes}</td>
                <td style={{ padding: '8px 10px' }}>{fmt(Number(r.text_bytes))}</td>
                <td style={{ padding: '8px 10px' }}>{fmt(Number(r.image_bytes))}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(Number(r.text_bytes) + Number(r.image_bytes))}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  {flags[r.user_id] && !flags[r.user_id].is_admin && (
                    <>
                      <button disabled={busy === r.user_id} onClick={() => act(r, flags[r.user_id].banned ? 'unban' : 'ban')} style={{ marginRight: 6, padding: '4px 10px', borderRadius: 8, background: '#2a3558', color: '#f3f5fb' }}>
                        {flags[r.user_id].banned ? 'Banı kaldır' : 'Banla'}
                      </button>
                      <button disabled={busy === r.user_id} onClick={() => act(r, 'delete')} style={{ padding: '4px 10px', borderRadius: 8, background: '#7a2230', color: '#fff' }}>
                        Sil
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bans.length > 0 && (
        <>
          <h2 style={{ marginTop: 36 }}>Silinip banlananlar</h2>
          {bans.map((b) => (
            <div key={b.email} style={{ padding: '6px 10px', borderTop: '1px solid rgba(255,255,255,.18)' }}>
              {b.email}
              <button
                onClick={async () => {
                  if (!window.confirm(`${b.email} banı kaldırılsın mı? Tekrar kayıt olabilir.`)) return
                  try { await store.adminUnbanEmail(b.email); await load() } catch (e) { window.alert(e.message || String(e)) }
                }}
                style={{ marginLeft: 12, padding: '3px 10px', borderRadius: 8, background: '#2a3558', color: '#f3f5fb' }}
              >
                Banı kaldır
              </button>
            </div>
          ))}
        </>
      )}

      <h2 style={{ marginTop: 36 }}>Odalar</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#e6c36a' }}>
              {['Oda', 'Sahip', 'Üye', 'Not', 'Metin'].map((h) => <th key={h} style={{ padding: '8px 10px' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.ws_id} style={{ borderTop: '1px solid rgba(255,255,255,.18)' }}>
                <td style={{ padding: '8px 10px' }}>{r.name}</td>
                <td style={{ padding: '8px 10px' }}>{r.owner_email}</td>
                <td style={{ padding: '8px 10px' }}>{r.members}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.notes}</td>
                <td style={{ padding: '8px 10px' }}>{fmt(Number(r.bytes))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div></div>
  )
}
