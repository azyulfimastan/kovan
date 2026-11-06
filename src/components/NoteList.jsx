// Middle column: list header (folder menu, sort, select), search and note cards.
import { useI18n } from '../i18n'
import { Bee, HexLogo, Icon } from '../icons'
import { FOLDER_COLORS, folderColor, when } from '../lib/util'
import { snippet } from '../lib/md'

export default function NoteList(props) {
  const { t, lang } = useI18n()
  const { activeId, allNotes, bulkDelete, colorMenu, exitSel, filter, flipSort, folderMenu, folders, heading, lastCard, lp, newNote, notes, openNote, others, peers, query, searchRef, selIds, selMode, setAddingFolder, setBulkMove, setColorMenu, setCtx, setFilter, setFolderColor, setFolderMenu, setQuery, setSelIds, setSelMode, setSideOpen, setView, sortAsc, startPress, toggleSel, trash, visible } = props
  return (
    <section className="list">
      <header className="list-head">
        <button className="icon-btn only-mid" onClick={() => setSideOpen(true)} title={t('menu')}>
          <Icon name="menu" />
        </button>
        <div className="list-title">
          <button className="title-btn" onClick={() => setFolderMenu((v) => !v)}>
            <h2>{heading}</h2>
            <Icon name="chevron" size={18} />
          </button>
          <span className="muted">{visible.length}</span>
          {filter.kind === 'folder' && folders.find((f) => f.id === filter.id) && (
            <>
              <button className="color-btn" title={t('pickColor')} onClick={() => setColorMenu((v) => !v)}>
                <span className="f-dot" style={{ background: folderColor(folders.find((f) => f.id === filter.id)) }} /> {t('pickColor')}
              </button>
              {colorMenu && (
                <>
                  <div className="menu-scrim" onClick={() => setColorMenu(false)} />
                  <div className="color-menu">
                    {FOLDER_COLORS.map((c) => (
                      <button key={c} style={{ background: c }} aria-label={c} className={folderColor(folders.find((f) => f.id === filter.id)) === c ? 'on' : ''} onClick={() => setFolderColor(folders.find((f) => f.id === filter.id), c)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {folderMenu && (
            <>
              <div className="menu-scrim" onClick={() => setFolderMenu(false)} />
              <div className="folder-menu">
                {[{ id: null, name: t('allNotes'), kind: 'all' }, ...folders.map((f) => ({ ...f, kind: 'folder' }))].map((f) => (
                  <button
                    key={f.id || 'all'}
                    className={(f.kind === 'all' ? filter.kind === 'all' : filter.kind === 'folder' && filter.id === f.id) ? 'on' : ''}
                    onClick={() => { setFilter(f.kind === 'all' ? { kind: 'all' } : { kind: 'folder', id: f.id }); setView('notes'); setFolderMenu(false) }}
                  >
                    {f.kind === 'folder' ? <span className="f-dot" style={{ background: folderColor(f) }} /> : <Icon name="notes" size={15} />} {f.name}
                  </button>
                ))}
                <button className="add" onClick={() => { setFolderMenu(false); setSideOpen(true); setAddingFolder(true) }}>
                  <Icon name="plus" size={14} /> {t('newFolder')}
                </button>
              </div>
            </>
          )}
        </div>
        {others.length > 0 && (
          <div className="peers" title={t('online', { n: String(others.length + 1) })}>
            {others.slice(0, 4).map((p) => (
              <span key={p.id} className="avatar sm" title={p.name}>
                {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : (p.name || '?').slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        )}
        <button className="sort-toggle" onClick={flipSort} title={sortAsc ? t('sortOldFirst') : t('sortNewFirst')}>
          {sortAsc ? '↑' : '↓'}
        </button>
        <button className={`sel-toggle ${selMode ? 'on' : ''}`} onClick={() => (selMode ? exitSel() : setSelMode(true))} title={t('select')}>
          {selMode ? t('done') : t('select')}
        </button>
        <button className="icon-btn top-plus" onClick={() => newNote()} title={t('newNote')}>
          <Icon name="plus" />
        </button>
      </header>
      <div className="list-search">
        <Icon name="search" size={15} />
        <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchNotes')} />
        {query && (
          <button className="clear-q" onClick={() => setQuery('')} aria-label={t('close')}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {selMode && (
        <div className="bulk-bar">
          <button className="bulk-all" onClick={() => setSelIds(selIds.length === visible.length ? [] : visible.map((n) => n.id))}>
            {selIds.length === visible.length && visible.length > 0 ? t('selectNone') : t('selectAll')}
          </button>
          <span className="muted bulk-n">{t('nSelected', { n: String(selIds.length) })}</span>
          <button className="bulk-act" disabled={!selIds.length} onClick={() => setBulkMove(true)}>
            <Icon name="folder" size={15} /> {t('moveFolder')}
          </button>
          <button className="bulk-act danger" disabled={!selIds.length} onClick={bulkDelete}>
            <Icon name="trash" size={15} /> {t('delete')}
          </button>
        </div>
      )}
      <ul className="cards">
        {visible.length === 0 && (
          <li className="empty-list">
            <div className="hive">
              <HexLogo size={40} />
              {!query && (
                <span className="bee-orbit small">
                  <span className="bee-bob">
                    <Bee size={22} />
                  </span>
                </span>
              )}
            </div>
            <strong>{query ? t('noResults') : t('empty')}</strong>
            {!query && <span className="muted">{t('emptyHint')}</span>}
          </li>
        )}
        {visible.map((n) => (
          <li key={n.id}>
            <button
              className={`card ${n.id === activeId && !selMode ? 'on' : ''} ${n.folder_id ? 'has-c' : ''} ${selMode ? 'sel-mode' : ''} ${selIds.includes(n.id) ? 'picked' : ''}`}
              style={n.folder_id ? { '--c': folderColor(folders.find((f) => f.id === n.folder_id)) } : undefined}
              onClick={(e) => {
                if (lp.current.fired) { lp.current.fired = false; return }
                if (selMode || e.ctrlKey || e.metaKey) { setSelMode(true); toggleSel(n.id); return }
                lastCard.current = { t: Date.now(), x: e.clientX, y: e.clientY }
                openNote(n.id)
              }}
              onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, kind: 'note', item: n }) }}
              onTouchStart={(e) => !selMode && startPress(e, n)}
              onMouseDown={(e) => e.button === 0 && !selMode && !e.ctrlKey && !e.metaKey && startPress(e, n)}
            >
              {selMode && <span className={`sel-box ${selIds.includes(n.id) ? 'on' : ''}`} aria-hidden="true" />}
              <div className="card-top">
                <strong>{n.title || t('untitled')}</strong>
                {n.pinned && <Icon name="pin" size={13} className="pin-ico" />}
                <span className="card-date">{when(n.updated_at, lang)}</span>
              </div>
              {snippet(n.body) && <p>{snippet(n.body)}</p>}
              {n.folder_id && filter.kind !== 'folder' && (() => {
                const f = folders.find((x) => x.id === n.folder_id)
                return f ? <span className="card-folder"><i style={{ background: folderColor(f) }} />{f.name}</span> : null
              })()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
