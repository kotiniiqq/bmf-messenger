import { useState, type FormEvent } from 'react';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';

/**
 * The prototype has no sign-in screen — it opens already authenticated — so
 * this follows its visual language rather than copying a layout.
 */
export function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * On by default: a desktop messenger that asks for a password at every launch
   * is a messenger people stop opening. Turning it off keeps the session only
   * until the app closes, which is what a shared machine needs.
   */
  const [remember, setRemember] = useState(true);

  const error = useApp((s) => s.error);
  const signIn = useApp((s) => s.signIn);
  const signUp = useApp((s) => s.signUp);

  const registering = mode === 'register';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (registering) await signUp(login, email, password, remember);
      else await signIn(login, password, remember);
    } catch {
      // The store already holds the message; the form just stops spinning.
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    login.trim().length > 0 &&
    password.length > 0 &&
    (!registering || (email.includes('@') && password.length >= 10));

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>BMF Messenger</h1>
        <p className="auth-sub">
          {registering ? t('authScreen.signUpSub') : t('authScreen.signInSub')}
        </p>

        <div className="fld">
          <label htmlFor="login">
            {registering ? t('authScreen.loginSignUp') : t('authScreen.loginSignIn')}
          </label>
          <input
            id="login"
            value={login}
            autoFocus
            autoComplete="username"
            onChange={(e) => setLogin(e.target.value)}
            placeholder={registering ? t('authScreen.loginHint') : ''}
          />
        </div>

        {registering && (
          <div className="fld">
            <label htmlFor="email">{t('authScreen.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}

        <div className="fld">
          <label htmlFor="password">{t('authScreen.password')}</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete={registering ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={registering ? t('authScreen.passwordHint') : ''}
          />
        </div>

        <div className="auth-remember">
          <div
            className={`tog${remember ? ' on' : ''}`}
            role="switch"
            aria-checked={remember}
            tabIndex={0}
            onClick={() => setRemember(!remember)}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                setRemember(!remember);
              }
            }}
          />
          <div className="auth-remember-text" onClick={() => setRemember(!remember)}>
            <div className="auth-remember-label">{t('authScreen.remember')}</div>
            <div className="auth-remember-sub">
              {remember ? t('authScreen.rememberOn') : t('authScreen.rememberOff')}
            </div>
          </div>
        </div>

        <button className="btn-main" type="submit" disabled={!canSubmit || busy}>
          {busy
            ? t('authScreen.busy')
            : registering
              ? t('authScreen.signUp')
              : t('authScreen.signIn')}
        </button>

        {error && <div className="msg-err">{error}</div>}

        <div className="auth-switch">
          {registering ? t('authScreen.haveAccount') : t('authScreen.noAccount')}
          <button type="button" onClick={() => setMode(registering ? 'login' : 'register')}>
            {registering ? t('authScreen.signIn') : t('authScreen.signUp')}
          </button>
        </div>

        {registering && (
          <p className="hint">{t('authScreen.terms')}</p>
        )}
      </form>
    </div>
  );
}
