import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons'
import { useI18n } from './i18n'
import { norm } from './lib/md'

export default function Palette({ open, onClose, notes, commands, onOpenNote }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => ref.current?.focus(), 20)
    }
  }, [open])

  const items = useMemo(() => {
    const s = norm(q)
    const cmds = commands
      .filter((c) => (s ? norm(c.label).includes(s) : !c.id.startsWith('lang-')))
      .map((c) => ({ key: 'c-' + c.id, kind: 'cmd', icon: c.icon, label: c.label, run: c.run }))
    const found = notes
      .filter((n) => !s || norm(n.title).includes(s) || norm(n.body).includes(s))
      .sort((a, b) =>
        s
          ? Number(norm(b.title).includes(s)) - Number(norm(a.title).includes(s))
          : (a.updated_at < b.updated_at ? 1 : -1),
      )
      .slice(0, s ? 8 : 5)
      .map((n) => ({ key: n.id, kind: 'note', icon: 'notes', label: n.title || t('untitled'), run: () => onOpenNote(n.id) }))
    return [...found, ...cmds]
  }, [q, notes, commands, t, onOpenNote])

  if (!open) return null

  function run(it) {
    onClose()
    it.run()
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input">
          <Icon name="search" />
          <input
            ref={ref}
            value={q}
            placeholder={t('palettePlaceholder')}
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIdx((i) => Math.min(i + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIdx((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter' && items[idx]) run(items[idx])
            }}
          />
        </div>
        <ul>
          {items.length === 0 && <li className="muted pal-empty">{t('noResults')}</li>}
          {items.map((it, i) => (
            <li key={it.key}>
              {(i === 0 || items[i - 1].kind !== it.kind) && (
                <div className="pal-group">{it.kind === 'note' ? t('notesLabel') : t('cmds')}</div>
              )}
              <button className={i === idx ? 'on' : ''} onMouseEnter={() => setIdx(i)} onClick={() => run(it)}>
                <Icon name={it.icon} size={16} />
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
