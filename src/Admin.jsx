import { useEffect, useState } from 'react'
import { store } from './store'

const fmt = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B')
const day = (d) => (d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

// Hidden page at /#admin. Anyone else is bounced to the normal app; the data call itself is
// refused by the database unless the signed-in e-mail is the owner's.
export default function Admin() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    store.adminOverview().then(setRows).catch(() => { window.location.replace('/') })
  }, [])
  if (!rows) return null
  const total = rows.reduce((a, r) => a + Number(r.text_bytes) + Number(r.image_bytes), 0)
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 16px', color: 'var(--text, #e8ecf8)', fontFamily: 'inherit' }}>
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <p style={{ opacity: 0.8 }}>{rows.length} kullanıcı · toplam {fmt(total)}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.7 }}>
              {['E-posta', 'Kayıt', 'Son giriş', 'Not', 'Metin', 'Resim', 'Toplam'].map((h) => <th key={h} style={{ padding: '8px 10px' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
                <td style={{ padding: '8px 10px' }}>{r.email}</td>
                <td style={{ padding: '8px 10px' }}>{day(r.created_at)}</td>
                <td style={{ padding: '8px 10px' }}>{day(r.last_sign_in)}</td>
                <td style={{ padding: '8px 10px' }}>{r.notes}</td>
                <td style={{ padding: '8px 10px' }}>{fmt(Number(r.text_bytes))}</td>
                <td style={{ padding: '8px 10px' }}>{fmt(Number(r.image_bytes))}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(Number(r.text_bytes) + Number(r.image_bytes))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
