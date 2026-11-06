// Small dialogs and menus used by the main screen.
import { useState } from 'react'
import { useI18n } from '../i18n'
import { Icon } from '../icons'
import { store } from '../store'
import { folderColor } from '../lib/util'

// dimmed backdrop + centered card; clicking outside closes
export function Modal({ onClose, className = '', as: Tag = 'div', children, ...rest }) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <Tag className={`dialog small ${className}`} onMouseDown={(e) => e.stopPropagation()} {...rest}>
        {children}
      </Tag>
    </div>
  )
}

// "move to folder" sheet, for one note (with board toggle) or many
export function FolderPicker({ title, folders, current, onPick, onClose, boardToggle }) {
  const { t } = useI18n()
  return (
    <Modal onClose={onClose} className="move-sheet">
      <div className="dlg-head">
        <h3>{t('moveFolder')}</h3>
      </div>
      <p className="muted move-title">{title}</p>
      {boardToggle}
      <div className="move-list">
        <button className={current === null ? 'on' : ''} onClick={() => onPick(null)}>
          <Icon name="notes" size={16} /> {t('noFolder')}
        </button>
        {folders.map((f) => (
          <button key={f.id} className={current === f.id ? 'on' : ''} onClick={() => onPick(f.id)}>
            <span className="f-dot" style={{ background: folderColor(f) }} /> {f.name}
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function JoinDialog({ onClose, onSubmit, busy }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  return (
    <Modal as="form" onClose={onClose} onSubmit={(e) => onSubmit(e, text)}>
      <div className="dlg-head">
        <h3>{t('joinRoom')}</h3>
      </div>
      <span className="muted">{t('joinHint')}</span>
      <input className="code-input" autoFocus inputMode="numeric" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} placeholder="000 000" maxLength={200} />
      <div className="dlg-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('cancel')}
        </button>
        <button className="btn primary" disabled={!text.trim() || busy}>
          {t('join')}
        </button>
      </div>
    </Modal>
  )
}

export function NewRoomDialog({ cloud, onClose, onCreate }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [invite, setInvite] = useState(true)
  return (
    <Modal
      as="form"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onCreate(name.trim(), invite)
      }}
    >
      <div className="dlg-head">
        <h3>{t('newNotebook')}</h3>
      </div>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('notebookName')} maxLength={80} />
      {cloud && (
        <>
          <label className="check-row">
            <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
            {t('roomWith')}
          </label>
          <span className="muted">{t('roomSoloHint')}</span>
        </>
      )}
      <div className="dlg-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('cancel')}
        </button>
        <button className="btn primary" disabled={!name.trim()}>
          {t('create')}
        </button>
      </div>
    </Modal>
  )
}

// permanent account deletion; the user has to type their e-mail first
export function DeleteAccountDialog({ email, onClose }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = text.trim().toLowerCase() === (email || '').toLowerCase()
  return (
    <Modal
      as="form"
      onClose={() => !busy && onClose()}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        setBusy(true)
        setErr('')
        try {
          await store.deleteMyAccount()
          window.location.replace('/')
        } catch (x) {
          setBusy(false)
          setErr(x.message || String(x))
        }
      }}
    >
      <div className="dlg-head">
        <h3>{t('deleteAccount')}</h3>
      </div>
      <p className="muted">{t('deleteAccountWarn')}</p>
      <p className="muted">{t('typeEmail', { email })}</p>
      <input className="code-input" autoFocus autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} placeholder={email} />
      {err && <p style={{ color: '#ff7b7b' }}>{err}</p>}
      <div className="dlg-foot">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          {t('cancel')}
        </button>
        <button type="submit" className="btn danger" disabled={busy || !ok}>
          {t('deleteAccountGo')}
        </button>
      </div>
    </Modal>
  )
}

export function IosHint({ onClose }) {
  const { t } = useI18n()
  return (
    <Modal onClose={onClose} className="ios-hint">
      <div className="dlg-head">
        <h3>{t('installApp')}</h3>
      </div>
      <ol>
        <li>{t('iosStep1')}</li>
        <li>{t('iosStep2')}</li>
        <li>{t('iosStep3')}</li>
      </ol>
      <button className="btn primary wide" onClick={onClose}>
        {t('gotIt')}
      </button>
    </Modal>
  )
}

// right-click menu: items = [{ icon, label, run, danger }]
export function ContextMenu({ x, y, items, onClose }) {
  return (
    <>
      <div
        className="menu-scrim"
        style={{ zIndex: 119 }}
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div className="ctx-menu" style={{ left: Math.min(x, window.innerWidth - 190), top: Math.min(y, window.innerHeight - 40 * items.length - 40) }}>
        {items.map((it) => (
          <button
            key={it.label}
            className={it.danger ? 'danger' : ''}
            onClick={() => {
              onClose()
              it.run()
            }}
          >
            <Icon name={it.icon} size={15} /> {it.label}
          </button>
        ))}
      </div>
    </>
  )
}

export function Toast({ toast, onDone }) {
  if (!toast) return null
  return (
    <div className="toast">
      <span>{toast.text}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action.run()
            onDone()
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
