export function matchesAnalysisTime(
  saved: string,
  entered: string,
  mode: string,
  timezone: string,
) {
  if (!entered.trim()) return false
  if (mode === 'offset')
    return Number.isFinite(Date.parse(entered)) && Date.parse(saved) === Date.parse(entered)
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(saved))
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return (
      `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}` ===
      (entered.length === 16 ? `${entered}:00` : entered)
    )
  } catch {
    return false
  }
}
