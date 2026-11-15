import type { MaintenanceTask, PlanSheet } from '../domain/calculations'

// Template v3 plan-sheet geometry (points). Kept separate from the PDF components.
export const BOX_W = 515
export const BOX_H = 300
export const PAD = 26
const PT_TO_MM = 25.4 / 72

/** Largest 1/2/5 x 10^k length not exceeding the target, in metres. */
export function niceLength(target: number) {
  if (!(target > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(target))
  for (const step of [5, 2, 1]) if (step * power <= target) return step * power
  return power
}

/** Ratio denominator when the A4 page is printed at 100%, to two significant figures. */
export function printRatio(pointsPerMetre: number) {
  const exact = 1000 / (pointsPerMetre * PT_TO_MM)
  const power = 10 ** (Math.floor(Math.log10(exact)) - 1)
  return Math.round(exact / power) * power
}

export function sheetScale(sheet: PlanSheet) {
  const width = Math.max(sheet.extent_m?.width ?? 1, 0.01)
  const height = Math.max(sheet.extent_m?.height ?? 1, 0.01)
  return Math.min((BOX_W - 2 * PAD) / width, (BOX_H - 2 * PAD - 18) / height)
}


export function incompleteTasks(tasks: MaintenanceTask[]) {
  return tasks.filter((task) => !task.task.trim() || !task.frequency.trim()).length
}

/** react-pdf hyphenation: keep words whole (hashes, codes, product names); only split
 * tokens longer than 32 characters into plain 32-character segments. */
export function wholeWords(word: string) {
  if (word.length <= 32) return [word]
  const parts: string[] = []
  for (let i = 0; i < word.length; i += 32) parts.push(word.slice(i, i + 32))
  return parts
}
