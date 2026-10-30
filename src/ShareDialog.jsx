import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { useI18n } from './i18n'
import { store } from './store'

export default function ShareDialog({ ws, me, onClose, onWsChange, onLeft }) {
  const { t } = useI18n()
  const [members, setMembers] = useState([])
  const [copied, setCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const isOwner = ws.owner_id === me.id
  const link = `${window.location.origin}/?join=${ws.invite_code}`

  useEffect(() => {
    store.getMembers(ws.id).then(setMembers).catch(() => {})
  }, [ws.id])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const el = document.getElementById('invite-link')
      el?.select()
      document.execCommand?.('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(ws.short_code)
    } catch {}
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 1800)
  }

  async function reset() {
    setBusy(true)
    try {
      await store.rotateInvite(ws.id)
      onWsChange(await store.getWorkspace(ws.id))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dlg-head">
          <h3>
            {t('shareTitle')} · <span className="muted">{ws.name}</span>
          </h3>
          <button className="icon-btn" onClick={onClose} title={t('close')}>
            <Icon name="x" />
          </button>
        </div>

        <label className="field">
          <span className="muted">{t('inviteHint')}</span>
          <div className="row">
            <input id="invite-link" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn primary" onClick={copy}>
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </label>
        {ws.short_code && (
          <div className="field">
            <span className="muted">{t('codeHint')}</span>
            <div className="row">
              <div className="room-code" aria-label={t('roomCode')}>
                {ws.short_code.slice(0, 3)} {ws.short_code.slice(3)}
              </div>
              <button className="btn" onClick={copyCode}>
                {codeCopied ? t('copied') : t('copyCode')}
              </button>
            </div>
          </div>
        )}
        {isOwner && (
          <button className="btn ghost small" disabled={busy} onClick={reset} title={t('resetHint')}>
            {t('resetLink')} <span className="muted">— {t('resetHint')}</span>
          </button>
        )}

        <h4 className="dlg-sub">
          <Icon name="users" size={15} /> {t('members')} ({members.length})
        </h4>
        <ul className="members">
          {members.map((m) => (
            <li key={m.user_id}>
              <span className="avatar">{(m.name || m.email || '?').slice(0, 1).toUpperCase()}</span>
              <span className="m-name">
                {m.name || m.email}
                {m.user_id === me.id && <em> · {t('you')}</em>}
                {m.user_id === ws.owner_id && <em> · {t('owner')}</em>}
              </span>
              <span className="muted m-mail">{m.email}</span>
            </li>
          ))}
        </ul>

        <div className="dlg-foot">
          {isOwner ? (
            <button
              className="btn danger small"
              onClick={async () => {
                if (!window.confirm(t('deleteWsConfirm'))) return
                await store.deleteWorkspace(ws.id)
                onLeft()
              }}
            >
              {t('deleteWs')}
            </button>
          ) : (
            <button
              className="btn danger small"
              onClick={async () => {
                if (!window.confirm(t('leaveConfirm'))) return
                await store.leaveWorkspace(ws.id, me.id)
                onLeft()
              }}
            >
              {t('leave')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
