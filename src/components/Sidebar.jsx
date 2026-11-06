// Left menu: rooms, folders, views, account.
import { useI18n, LANGS } from '../i18n'
import { Bee, HexLogo, Icon } from '../icons'
import { cloud } from '../store'
import { FOLDER_COLORS, QUOTA, fmtBytes, folderColor } from '../lib/util'

export default function Sidebar(props) {
  const { t, lang, setLang } = useI18n()
  const { addFolder, addingFolder, allNotes, closeSide, cycleFolderColor, drag, filter, folderName, folders, foldersOpen, installApp, installEvt, isIOS, members, newNote, nextTheme, notes, peers, setActiveId, setAddingFolder, setCtx, setDelAcc, setDialog, setFilter, setFolderName, setFoldersOpen, setView, setWid, signOut, standalone, theme, trash, usage, user, view, wid, wide, workspaces, ws } = props
  return (
    <aside className="side">
      <div className="brand">
        <span className="brand-hex">
          <HexLogo size={26} />
          <Bee size={15} className="brand-bee" />
        </span>
        <span className="logo-wrap">
          <span className="logo-text">Kovan</span>
          <small className="credit">{t('createdBy')}</small>
        </span>
      </div>

      <div className="rooms">
        <div className="room-tiles">
          {workspaces.map((w) => {
            const hue = [...String(w.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % FOLDER_COLORS.length
            return (
              <button
                key={w.id}
                className={`room-tile ${w.id === wid ? 'on' : ''}`}
                style={{ '--rc': FOLDER_COLORS[hue] }}
                title={w.name}
                onClick={() => { if (w.id !== wid) setWid(w.id) }}
                onContextMenu={(e) => { if (!cloud) return; e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, kind: 'ws', item: w }) }}
              >
                {(w.name || '?').trim().slice(0, 1).toUpperCase()}
              </button>
            )
          })}
          {cloud && (
            <button className="room-tile add" title={t('newNotebook')} onClick={() => setDialog('newws')}>
              <Icon name="plus" size={16} />
            </button>
          )}
        </div>
        <div className="room-name">
          <strong>{ws?.name || ''}</strong>
          {ws && (
            <button className="icon-btn ws-more" title={t('more')} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCtx({ x: r.left, y: r.bottom + 4, kind: 'ws', item: ws }) }}>
              <Icon name="dots" size={16} />
            </button>
          )}
        </div>
      </div>

      {cloud && (
        <button className="btn soft wide" onClick={() => setDialog(ws ? 'share' : 'join')}>
          <Icon name="users" size={16} /> {t('inviteJoin')}
        </button>
      )}
      {cloud && members.length > 0 && (
        <button className="member-strip" onClick={() => setDialog('share')} title={t('members')}>
          <span className="avs">
            {members.slice(0, 6).map((m) => (
              <span key={m.user_id} className={`avatar sm ${peers.some((p) => p.id === m.user_id) ? 'on' : ''}`} title={m.name || m.email}>
                {(m.name || m.email || '?').slice(0, 1).toUpperCase()}
              </span>
            ))}
            {members.length > 6 && <span className="avatar sm more">+{members.length - 6}</span>}
          </span>
          <span className="muted">{t('membersOnline', { n: String(members.length), o: String(Math.max(1, peers.length)) })}</span>
        </button>
      )}
      <button className="btn primary wide side-new" onClick={() => newNote()}>
        <Icon name="plus" size={16} /> {t('newNote')}
      </button>

      <nav className="nav">
        <button
          className={view === 'notes' && filter.kind === 'all' ? 'on' : ''}
          data-fid=""
          onClick={() => {
            const already = view === 'notes' && filter.kind === 'all'
            setFilter({ kind: 'all' })
            setView('notes')
            setActiveId(null)
            if (already) setFoldersOpen((o) => !o)
            else setFoldersOpen(true)
          }}
        >
          <Icon name="notes" size={16} /> {t('allNotes')} <em>{notes.length}</em>
          <Icon name="chevron" size={13} className={`all-chev ${foldersOpen ? 'open' : ''}`} />
        </button>
        {(foldersOpen || drag) && folders.map((f) => (
          <button
            key={f.id}
            data-fid={f.id}
            onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, kind: 'folder', item: f }) }}
            className={`folder-item sub ${drag?.over === f.id ? 'over' : ''} ${view === 'notes' && filter.kind === 'folder' && filter.id === f.id ? 'on' : ''}`}
            onClick={() => {
              setFilter({ kind: 'folder', id: f.id })
              setView('notes')
              setActiveId(null)
              closeSide()
            }}
          >
            <span
              className="f-dot"
              role="button"
              title={t('folderColor')}
              style={{ background: folderColor(f) }}
              onClick={(e) => {
                e.stopPropagation()
                cycleFolderColor(f)
              }}
            />{' '}
            <span className="f-name">{f.name}</span>
            <em>{notes.filter((n) => n.folder_id === f.id).length}</em>
          </button>
        ))}
        {!foldersOpen && !drag && <span className="sub muted fold-hint">{folders.length} {t('folders')}</span>}
        {foldersOpen && (addingFolder ? (
          <form onSubmit={addFolder} className="sub">
            <input
              className="folder-input"
              autoFocus
              value={folderName}
              maxLength={60}
              placeholder={t('folderName')}
              onChange={(e) => setFolderName(e.target.value)}
              onBlur={() => !folderName.trim() && setAddingFolder(false)}
              onKeyDown={(e) => e.key === 'Escape' && (setFolderName(''), setAddingFolder(false))}
            />
          </form>
        ) : (
          <button className="sub add-folder" onClick={() => setAddingFolder(true)}>
            <Icon name="plus" size={14} /> {t('newFolder')}
          </button>
        ))}
        <button
          className={view === 'notes' && filter.kind === 'pinned' ? 'on' : ''}
          onClick={() => {
            setFilter({ kind: 'pinned' })
            setView('notes')
            closeSide()
          }}
        >
          <Icon name="pin" size={16} /> {t('pinned')} <em>{notes.filter((n) => n.pinned).length}</em>
        </button>
        <button
          className={view === 'board' ? 'on' : ''}
          onClick={() => {
            setView('board')
            setActiveId(null)
            closeSide()
          }}
        >
          <Icon name="board" size={16} /> {t('board')}
        </button>
        <button
          className={view === 'trash' ? 'on' : ''}
          onClick={() => {
            setView('trash')
            setActiveId(null)
            closeSide()
          }}
        >
          <Icon name="trash" size={16} /> {t('trash')} {trash.length > 0 && <em>{trash.length}</em>}
        </button>
      </nav>

      <div className="side-foot">
        {!standalone && (installEvt || isIOS) && (
          <button className="install-btn" onClick={installApp}>
            <span className="install-ico">
              <HexLogo size={22} />
            </span>
            <span>
              <strong>{t('installApp')}</strong>
              <small>{t('installSub')}</small>
            </span>
          </button>
        )}
        {!cloud && (
          <p className="local-note">
            {t('localMode')} <span>{t('localHint')}</span>
          </p>
        )}
        {cloud && (
          <div className="me">
            {user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(user.name || '?').slice(0, 1)}</span>}
            <span className="me-name">{user.name || user.email}</span>
            <button className="icon-btn" onClick={signOut} title={t('signOut')}>
              <Icon name="logout" size={16} />
            </button>
            <button className="icon-btn danger-ico" onClick={() => setDelAcc(true)} title={t('deleteAccount')}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        )}
        {cloud && usage != null && (
          <div className="usage" title={t('storageUsed')}>
            <div className="usage-bar"><i style={{ width: Math.min(100, (usage / QUOTA) * 100) + '%' }} className={usage / QUOTA > 0.9 ? 'hot' : ''} /></div>
            <span>{fmtBytes(usage)} / {fmtBytes(QUOTA)}</span>
          </div>
        )}
        <div className="foot-row">
          <div className="lang-row small">
            {LANGS.map((l) => (
              <button key={l.code} className={l.code === lang ? 'on' : ''} onClick={() => setLang(l.code)} title={l.label}>
                {l.short}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={nextTheme} title={t('theme')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
