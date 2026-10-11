import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound, Leaf, ShieldCheck } from 'lucide-react'
import { authConfigured, supabase } from '../services/auth'

export default function AuthPanel({ onDemo, recovery, onRecovered, expired }: { onDemo: () => void; recovery: boolean; onRecovered: () => void; expired: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRecovery, setIsRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setMessage(''); setError('')
    try {
      if (recovery) {
        const result = await supabase.auth.updateUser({ password })
        if (result.error) throw result.error
        onRecovered(); setPassword(''); setMessage('Password updated. You can continue to your workspace.')
      } else if (isRecovery) {
        const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}` })
        if (result.error) throw result.error
        setMessage('If this address has an account, a recovery link will arrive by email.')
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password })
        if (result.error) throw result.error
        setPassword('')
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed. Please retry.') }
    finally { setBusy(false) }
  }
  return <div className="auth-layout">
    <section className="auth-story"><div className="eyebrow light"><Leaf size={16} />Outdoor possibilities, grounded</div><h1>Better spaces<br /><em>begin with a site.</em></h1><p>Give your outdoor project a clear starting point. Locate the place, understand the brief, and keep your team’s decisions together.</p><div className="auth-diagram" aria-hidden="true"><div className="diagram-site"><span /><span /><span /><span /><i /></div><div className="diagram-caption">PLACE → PURPOSE → PROJECT</div></div><span className="auth-footnote">A shared foundation for developer decisions and contractor proposals.</span></section>
    <section className="auth-card"><div className="icon-tile"><KeyRound size={24} /></div><span className="eyebrow">Your workspace</span><h2>{recovery ? 'Choose a new password' : isRecovery ? 'Recover your account' : 'Welcome to InfraShader'}</h2><p>{recovery ? 'Set your new account password to finish recovery.' : isRecovery ? 'We’ll send you a link through your identity provider.' : 'Sign in to access your organisation’s projects.'}</p>
      {expired && <div role="alert" className="notice warning">Your session expired or access was revoked. Sign in again to continue.</div>}
      {!authConfigured && <div className="notice">Organisation sign-in awaits Supabase setup. You can try the separate Browser Demo below.</div>}
      <form onSubmit={submit}>
        {!recovery && <label>Email address<input disabled={!authConfigured || busy} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organisation.com" /></label>}
        {(!isRecovery || recovery) && <label>{recovery ? 'New password' : 'Password'}<input disabled={!authConfigured || busy} type="password" autoComplete={recovery ? 'new-password' : 'current-password'} required minLength={recovery ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
        {error && <p className="field-error" role="alert">{error}</p>}{message && <p className="success-text" role="status">{message}</p>}
        <button className="button primary full" disabled={!authConfigured || busy}>{busy ? 'Please wait…' : recovery ? 'Update password' : isRecovery ? 'Send recovery link' : 'Sign in'}<ArrowRight size={17} /></button>
      </form>
      {!recovery && <button className="button text full" onClick={() => { setIsRecovery(!isRecovery); setError(''); setMessage('') }}>{isRecovery ? 'Back to sign in' : 'Forgot your password?'}</button>}
      <div className="demo-entry"><span>Explore the local experience</span><button className="button secondary full" onClick={onDemo}>Open Browser Demo<ArrowRight size={16} /></button><p>Saved only in this browser. No real organisation data, quantities, shade results or pricing.</p></div>
      <div className="privacy-note"><ShieldCheck size={16} />Organisation access is checked by the server.</div>
    </section>
  </div>
}
