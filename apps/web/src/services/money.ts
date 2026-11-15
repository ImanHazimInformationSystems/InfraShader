/** Display-only Malaysian ringgit formatting of API decimal strings (never used for maths). */
export const ringgit = (value: string | number | null | undefined) =>
  value == null || value === ''
    ? '—'
    : `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
