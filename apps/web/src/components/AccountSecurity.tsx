import { useState, type FormEvent } from 'react'
import { supabase } from '../services/auth'
import { Button } from './ui/button'

export default function AccountSecurity({
  email,
  disabled,
  onDirty,
}: {
  email: string
  disabled: boolean
  onDirty: (value: boolean) => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [nextEmail, setNextEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function update(event: FormEvent, kind: 'password' | 'email') {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setNotice('')
    if (kind === 'password' && password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await supabase.auth.updateUser(
        kind === 'password' ? { password } : { email: nextEmail },
        { emailRedirectTo: `${window.location.origin}/settings` },
      )
      if (result.error) throw result.error
      setPassword('')
      setConfirmation('')
      setNextEmail('')
      onDirty(false)
      setNotice(
        kind === 'password'
          ? 'Password changed through your identity provider.'
          : 'Email change requested. Follow the identity provider confirmation instructions; the current address remains until confirmed.',
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Account update failed. Sign in again and retry.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="my-5 rounded border border-stone-300 p-4">
      <summary>Account email and password</summary>
      <p>Signed-in email: {email || 'Not supplied by the identity provider'}</p>
      <p>
        Credentials and confirmation are managed by Supabase Auth. Application roles and
        organisation access remain unchanged.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={(event) => void update(event, 'password')}>
        <fieldset disabled={disabled || busy || Boolean(nextEmail)}>
          <label>
            New account password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                onDirty(true)
              }}
            />
          </label>
          <label>
            Confirm account password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value)
                onDirty(true)
              }}
            />
          </label>
          <Button>Change account password</Button>
        </fieldset>
      </form>
      <form onSubmit={(event) => void update(event, 'email')}>
        <fieldset disabled={disabled || busy || Boolean(password || confirmation)}>
          <label>
            New account email
            <input
              type="email"
              autoComplete="email"
              required
              value={nextEmail}
              onChange={(event) => {
                setNextEmail(event.target.value)
                onDirty(true)
              }}
            />
          </label>
          <p>This requests confirmation through the provider's configured email service.</p>
          <Button>Request email change</Button>
        </fieldset>
      </form>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setPassword('')
          setConfirmation('')
          setNextEmail('')
          setError('')
          setNotice('')
          onDirty(false)
        }}
      >
        Cancel account changes
      </Button>
    </details>
  )
}
