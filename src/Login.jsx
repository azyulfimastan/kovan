import { useState } from 'react'
import { HexLogo } from './icons'
import { LANGS, useI18n } from './i18n'
import { store } from './store'

export default function Login() {
  const { t, lang, setLang } = useI18n()
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    setErr(false)
    try {
      await store.signIn()
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-hex">
          <HexLogo size={64} />
        </div>
        <h1 className="logo-text">Kovan</h1>
        <p className="tagline">{t('tagline')}</p>
        <h2>{t('loginTitle')}</h2>
        <p className="muted">{t('loginSub')}</p>
        <button className="btn google" onClick={go} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          {t('signInGoogle')}
        </button>
        {err && <p className="err">{t('loginError')}</p>}
        <div className="lang-row">
          {LANGS.map((l) => (
            <button key={l.code} className={l.code === lang ? 'on' : ''} onClick={() => setLang(l.code)}>
              {l.short}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
