import { z } from 'zod'
export const settingsSchema = z.object({
  workspaces: z.array(z.enum(['studio', 'review'])),
  workspace_setup_required: z.boolean(),
  id: z.uuid(),
  name: z.string(),
  revision: z.number(),
  settings: z.object({
    timezone: z.string(),
    currency: z.literal('MYR'),
    units: z.enum(['metric', 'imperial']),
    default_markup: z.string(),
  }),
})
