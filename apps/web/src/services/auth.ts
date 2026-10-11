import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
// A service-role or secret key must never enter a browser bundle.
function browserSafeKey(value: string) {
  if (value.startsWith('sb_secret_')) return false
  if (value.startsWith('sb_publishable_')) return true
  try { return JSON.parse(atob(value.split('.')[1])).role === 'anon' } catch { return false }
}
function safeUrl(value: string) {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) } catch { return false }
}
export const authConfigured = Boolean(url && safeUrl(url) && key && browserSafeKey(key))
export const supabase = authConfigured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null
