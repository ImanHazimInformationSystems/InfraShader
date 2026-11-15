// S09: spreadsheet-safe CSV cell (matches apps/api/app/csv_safety.py). Formula-like text is
// prefixed with an apostrophe; plain decimal numbers (including negatives) stay numeric.
export function csvCell(value: unknown) {
  const text = String(value ?? '')
  const risky = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)
  return `"${(risky ? `'${text}` : text).replaceAll('"', '""')}"`
}
