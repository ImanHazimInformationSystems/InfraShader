import { createContext, useContext } from 'react'
import type { Tool } from './StudioShell'

export const StudioContext = createContext<{
  canvas: HTMLDivElement | null
  tool: Tool
  immersive: boolean
  precision: boolean
  panelOpen: boolean
  /** True in Design Studio, where tools are grouped into the four proposal steps. */
  journey: boolean
}>({ canvas: null, tool: 'layout', immersive: false, precision: false, panelOpen: false, journey: false })

export function useStudioToolActive(tool: Tool) {
  const state = useContext(StudioContext)
  return !state.immersive || (state.tool === tool && state.panelOpen)
}
