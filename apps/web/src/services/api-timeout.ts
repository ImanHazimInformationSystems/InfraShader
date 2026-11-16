/** A sleeping pilot host needs time to wake up. Invalid config keeps the normal default. */
export function apiTimeout(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isInteger(parsed) && parsed >= 15000 && parsed <= 120000 ? parsed : 15000
}
