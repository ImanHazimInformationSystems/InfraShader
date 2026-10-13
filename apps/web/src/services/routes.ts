export type Screen = 'settings' | 'projects' | 'explore' | 'create' | 'project' | 'edit'
const uuid = '[0-9a-fA-F-]{36}'
const projectPath = new RegExp(`^/(organisations/(${uuid})|demo)/projects/(${uuid})(/edit)?$`)
export function parseRoute(
  path: string,
): { screen: Screen; org?: string; project?: string; demo?: boolean } | null {
  if (path === '/' || path === '/projects') return { screen: 'projects' }
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
) {
  if ((screen === 'project' || screen === 'edit') && project)
    return `${demo ? '/demo' : `/organisations/${project.organisation_id}`}/projects/${project.id}${screen === 'edit' ? '/edit' : ''}`
  return screen === 'projects' ? '/projects' : `/${screen}`
}
