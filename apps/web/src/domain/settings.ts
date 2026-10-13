import { z } from 'zod'
export const settingsSchema = z.object({
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
