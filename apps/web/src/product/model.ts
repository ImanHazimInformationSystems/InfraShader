import catalogue from './catalogue.json'

export type WorkspaceMode = 'studio' | 'review'
export type ProductFeature = (typeof catalogue)[number]
export const features: readonly ProductFeature[] = catalogue

export const areas = [
  {
    id: 'site',
    name: 'Site & evidence',
    description: 'Locate the site. Establish what is known.',
    workspace: 'studio',
  },
  {
    id: 'design',
    name: 'Design workspace',
    description: 'Shape the outdoor plan around the site.',
    workspace: 'studio',
  },
  {
    id: 'studies',
    name: 'Studies & checks',
    description: 'Compare options, sunlight and constraints.',
    workspace: 'studio',
  },
  {
    id: 'pricing',
    name: 'Quantities & pricing',
    description: 'Trace the scope from measurement to price.',
    workspace: 'studio',
  },
  {
    id: 'delivery',
    name: 'Proposals & delivery',
    description: 'Prepare a clear proposal and a considered handover.',
    workspace: 'studio',
  },
  {
    id: 'business',
    name: 'Opportunities',
    description: 'Keep clients, opportunities and next actions together.',
    workspace: 'studio',
  },
  {
    id: 'portfolio',
    name: 'Portfolio & outcomes',
    description: 'See projects in context, from brief to maintenance.',
    workspace: 'review',
  },
  {
    id: 'briefs',
    name: 'Briefs & submissions',
    description: 'Set a common baseline and review incoming evidence.',
    workspace: 'review',
  },
  {
    id: 'evaluation',
    name: 'Evaluate & compare',
    description: 'Follow the evidence to a defensible comparison.',
    workspace: 'review',
  },
  {
    id: 'decisions',
    name: 'Decisions & reports',
    description: 'Keep rationale, approvals and issued records together.',
    workspace: 'review',
  },
  {
    id: 'assistant',
    name: 'Assistance',
    description: 'Source-led assistance, with human review at every step.',
    workspace: 'both',
  },
  {
    id: 'inbox',
    name: 'Inbox & tasks',
    description: 'Bring questions, notes and responsibility into view.',
    workspace: 'shared',
  },
  {
    id: 'records',
    name: 'Files & history',
    description: 'Keep sources, versions and disclosure boundaries visible.',
    workspace: 'shared',
  },
  {
    id: 'organisation',
    name: 'Organisation & access',
    description: 'Manage workspace access and team responsibilities.',
    workspace: 'shared',
  },
  {
    id: 'preferences',
    name: 'Preferences',
    description: 'A comfortable workspace, in the right units.',
    workspace: 'shared',
  },
  {
    id: 'system',
    name: 'Jobs & recovery',
    description: 'Understand availability, revisions and background work.',
    workspace: 'shared',
  },
  {
    id: 'privacy',
    name: 'Privacy & AI controls',
    description: 'Review source access and processing boundaries.',
    workspace: 'shared',
  },
  {
    id: 'help',
    name: 'Help & feedback',
    description: 'Learn the workflow and capture feedback for review.',
    workspace: 'shared',
  },
] as const

export function areaFeatures(workspace: WorkspaceMode, group: string) {
  return features.filter(
    (feature) =>
      feature.group === group &&
      (feature.id.startsWith('S') ||
        feature.id.startsWith('A') ||
        (workspace === 'studio' ? feature.id.startsWith('L') : feature.id.startsWith('O'))),
  )
}

export function productPath(workspace: WorkspaceMode, area: string, feature?: string) {
  return `/${workspace}/workspace/${area}${feature ? `/${feature}` : ''}`
}

export function priorityStage(feature: ProductFeature) {
  if (feature.priority.includes('CORE') || feature.priority.includes('KEEP')) return 'Core / Keep'
  return feature.priority === 'LATER' ? 'Later' : 'Next'
}
