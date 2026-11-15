export type Screen = 'home' | 'settings' | 'projects' | 'explore' | 'create' | 'project' | 'edit' | 'product'
const uuid = '[0-9a-fA-F-]{36}'
const projectPath = new RegExp(`^/(organisations/(${uuid})|demo)/projects/(${uuid})(/edit)?$`)
export function parseRoute(
  path: string,
): {
  screen: Screen
  org?: string
  project?: string
  demo?: boolean
  workspace?: 'studio' | 'review'
  area?: string
  feature?: string
} | null {
  const workspaceMatch = path.match(/^\/(studio|review)(\/.*)?$/)
  if (workspaceMatch) {
    const parsed = parseRoute(workspaceMatch[2] || '/projects')
    return parsed ? { ...parsed, workspace: workspaceMatch[1] as 'studio' | 'review' } : null
  }
  if (path === '/' || path === '/home') return { screen: 'home' }
  if (path === '/projects') return { screen: 'projects' }
  const productMatch = path.match(/^\/workspace\/([a-z-]+)(?:\/([LOSA][0-9]{2}))?$/)
  if (productMatch) return { screen: 'product', area: productMatch[1], feature: productMatch[2] }
  if (path === '/explore' || path === '/create' || path === '/settings')
    return { screen: path.slice(1) as Screen }
  const match = path.match(projectPath)
  return match
    ? {
        screen: match[4] ? 'edit' : 'project',
        org: match[2],
        project: match[3],
        demo: match[1] === 'demo',
      }
    : null
}
export function screenPath(
  screen: Screen,
  project?: { id: string; organisation_id: string } | null,
  demo = false,
  workspace?: 'studio' | 'review',
) {
  const prefix = !demo && workspace ? `/${workspace}` : ''
  if (screen === 'home') return '/home'
  if (screen === 'product') return `${prefix}/workspace/site`
  if ((screen === 'project' || screen === 'edit') && project)
    return `${prefix}${demo ? '/demo' : `/organisations/${project.organisation_id}`}/projects/${project.id}${screen === 'edit' ? '/edit' : ''}`
  return prefix + (screen === 'projects' ? (prefix ? '' : '/projects') : `/${screen}`)
}
