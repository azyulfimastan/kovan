import { useEffect, useMemo, useRef, useState } from 'react'
import Sortable from 'sortablejs'
import { Icon } from './icons'
import { useI18n } from './i18n'

export const LABELS = { red: '#d9534f', orange: '#e08a2b', yellow: '#d4b020', green: '#3fa56a', blue: '#3b82d6', purple: '#8a63d2' }

function checks(body) {
  const all = (body || '').match(/^\s*[-*+]\s+\[[ xX]\]/gm) || []
  return { total: all.length, done: all.filter((x) => /\[[xX]\]/.test(x)).length }
}

function dueInfo(due) {
  if (!due) return null
  const d = new Date(due + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 864e5)
  return { cls: diff < 0 ? 'over' : diff <= 1 ? 'soon' : '', text: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }
}

const between = (prev, next) => (prev != null && next != null ? (prev + next) / 2 : prev != null ? prev + 1000 : next != null ? next - 1000 : 1000)

export default function Board({ notes, columns, members, onOpen, onMove, onAdd, onAddColumn, onRenameColumn, onDeleteColumn, onMoveColumn, header, folderOf }) {
  const { t } = useI18n()
  const root = useRef(null)
  const dragging = useRef(false)
  const [adding, setAdding] = useState(null) // column id ('' = inbox)
  const [cardTitle, setCardTitle] = useState('')
  const [editing, setEditing] = useState(null)
  const [newCol, setNewCol] = useState(false)
  const [colName, setColName] = useState('')

  const byCol = useMemo(() => {
    const m = new Map([['', []]])
    columns.forEach((c) => m.set(c.id, []))
    notes.forEach((n) => m.get(n.column_id && m.has(n.column_id) ? n.column_id : columns[0]?.id ?? '').push(n))
    for (const [k, l] of m) l.sort(k === '' ? (a, b) => (a.updated_at < b.updated_at ? 1 : -1) : (a, b) => a.pos - b.pos || (a.updated_at < b.updated_at ? 1 : -1))
    return m
  }, [notes, columns])

  const live = useRef({})
  live.current = { byCol, columns, onMove, onMoveColumn }

  const colKey = columns.map((c) => c.id).join(',')
  useEffect(() => {
    const el = root.current
    if (!el) return
    const insts = []
    const revert = (evt) => {
      evt.item.parentNode.removeChild(evt.item)
      evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex] || null)
    }
    el.querySelectorAll('.col-cards').forEach((list) => {
      insts.push(
        Sortable.create(list, {
          group: 'cards',
          animation: 150,
          forceFallback: true,
          delay: 140,
          delayOnTouchOnly: true,
          touchStartThreshold: 8,
          ghostClass: 'drag-ghost',
          chosenClass: 'drag-chosen',
          onStart: () => (dragging.current = true),
          onEnd: (evt) => {
            setTimeout(() => (dragging.current = false), 60)
            const id = evt.item.dataset.id
            const to = evt.to.dataset.col || ''
            revert(evt)
            const others = (live.current.byCol.get(to) || []).filter((n) => n.id !== id)
            const pos = between(others[evt.newIndex - 1]?.pos, others[evt.newIndex]?.pos)
            live.current.onMove(id, { column_id: to || null, pos: to ? pos : 0 })
          },
        }),
      )
    })
    const cont = el.querySelector('.cols')
    if (cont)
      insts.push(
        Sortable.create(cont, {
          animation: 150,
          handle: '.col-grip',
          draggable: '.col',
          forceFallback: true,
          onEnd: (evt) => {
            const id = evt.item.dataset.id
            revert(evt)
            const others = live.current.columns.filter((c) => c.id !== id)
            live.current.onMoveColumn(id, between(others[evt.newIndex - 1]?.pos, others[evt.newIndex]?.pos))
          },
        }),
      )
    return () => insts.forEach((i) => i.destroy())
  }, [colKey])

  function submitCard(e, colId) {
    e.preventDefault()
    const v = cardTitle.trim()
    if (v) onAdd(colId, v)
    setCardTitle('')
  }

  const member = (id) => members.find((m) => m.user_id === id)

  function renderCard(n) {
    const cover = n.images?.[0]
    const ck = checks(n.body)
    const due = dueInfo(n.due)
    const who = n.assignee && member(n.assignee)
    return (
      <div key={n.id} className={`kcard ${n.folder_id ? 'has-c' : ''}`} style={n.folder_id && folderOf ? { '--c': folderOf(n) } : undefined} data-id={n.id} onClick={() => !dragging.current && onOpen(n.id)}>
        {n.label && LABELS[n.label] && <span className="k-label" style={{ background: LABELS[n.label] }} />}
        {cover && <img className="k-cover" src={cover} alt="" loading="lazy" draggable={false} />}
        <div className="k-title">{n.title || t('untitled')}</div>
        {(due || ck.total > 0 || who) && (
          <div className="k-meta">
            {due && <span className={`k-due ${due.cls}`}>{due.text}</span>}
            {ck.total > 0 && <span className={`k-ck ${ck.done === ck.total ? 'ok' : ''}`}>☑ {ck.done}/{ck.total}</span>}
            {who && <span className="avatar sm k-who" title={who.name || who.email}>{(who.name || who.email || '?').slice(0, 1).toUpperCase()}</span>}
          </div>
        )}
      </div>
    )
  }

  function renderAdd(colId) {
    return adding === colId ? (
      <form onSubmit={(e) => submitCard(e, colId)} className="k-add">
        <input
          autoFocus
          value={cardTitle}
          placeholder={t('cardTitle')}
          maxLength={120}
          onChange={(e) => setCardTitle(e.target.value)}
          onBlur={() => {
            if (!cardTitle.trim()) setAdding(null)
          }}
          onKeyDown={(e) => e.key === 'Escape' && (setAdding(null), setCardTitle(''))}
        />
      </form>
    ) : (
      <button
        className="k-add-btn"
        onClick={() => {
          setAdding(colId)
          setCardTitle('')
        }}
      >
        <Icon name="plus" size={14} /> {t('addCard')}
      </button>
    )
  }

  return (
    <div className="board-wrap">
      {header}
      <div className="board" ref={root}>
        <div className="cols">
          {columns.map((c) => (
            <section className="col" key={c.id} data-id={c.id}>
              <div className="col-head">
                <span className="col-grip" title="⇄">
                  <Icon name="menu" size={15} />
                </span>
                {editing === c.id ? (
                  <input
                    className="col-name-input"
                    autoFocus
                    defaultValue={c.name}
                    maxLength={60}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== c.name) onRenameColumn(c.id, v)
                      setEditing(null)
                    }}
                    onKeyDown={(e) => (e.key === 'Enter' ? e.target.blur() : e.key === 'Escape' && setEditing(null))}
                  />
                ) : (
                  <strong className="col-name" onClick={() => setEditing(c.id)}>
                    {c.name}
                  </strong>
                )}
                <em>{byCol.get(c.id).length}</em>
                <button className="icon-btn" title={t('delete')} onClick={() => onDeleteColumn(c.id)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div className="col-cards" data-col={c.id}>
                {byCol.get(c.id).map(renderCard)}
              </div>
              {renderAdd(c.id)}
            </section>
          ))}
        </div>

        <div className="col add-col">
          {newCol ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (colName.trim()) onAddColumn(colName.trim())
                setColName('')
                setNewCol(false)
              }}
            >
              <input autoFocus value={colName} placeholder={t('columnName')} maxLength={60} onChange={(e) => setColName(e.target.value)} onBlur={() => !colName.trim() && setNewCol(false)} />
            </form>
          ) : (
            <button className="k-add-btn" onClick={() => setNewCol(true)}>
              <Icon name="plus" size={14} /> {t('addColumn')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
