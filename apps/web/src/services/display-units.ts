import { createContext, useContext } from 'react'
export type DisplayUnits = 'metric' | 'imperial'
export const DisplayUnitsContext = createContext<DisplayUnits>('metric')
export const useDisplayUnits = () => useContext(DisplayUnitsContext)
export function displayQuantity(value: number, unit: string, preference: DisplayUnits) {
  if (!Number.isFinite(value)) return 'Unavailable'
  if (preference === 'imperial' && (unit === 'm' || unit === 'm2')) {
    const converted = value / (unit === 'm2' ? 0.3048 ** 2 : 0.3048)
    return `${converted.toFixed(2)} ${unit === 'm2' ? 'ft2' : 'ft'} (${value.toFixed(2)} ${unit} canonical)`
  }
  return `${value.toFixed(2)} ${unit}`
}
