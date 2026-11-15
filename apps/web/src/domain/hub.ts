import { z } from 'zod'
import type { ProjectInput } from './projects'
export const templateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  purpose: z.enum(['developer_decision', 'contractor_proposal']),
  problem: z.string().max(4000),
  intended_users: z.string().max(2000),
  desired_outcome: z.string().max(4000),
  use_periods: z.string().max(2000),
  project_type: z.string().max(160),
  priorities: z.string().max(4000),
  constraints: z.string().max(4000),
})
export type BriefTemplate = z.infer<typeof templateSchema>
export function templateFromProject(project: ProjectInput): BriefTemplate {
  return {
    name: `${project.name} template`.slice(0, 160),
    purpose: project.purpose,
    problem: project.problem,
    intended_users: project.intended_users,
    desired_outcome: project.desired_outcome,
    use_periods: project.use_periods,
    project_type: project.details?.project_type ?? '',
    priorities: project.details?.priorities ?? '',
    constraints: project.details?.constraints ?? '',
  }
}
