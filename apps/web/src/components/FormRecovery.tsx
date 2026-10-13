import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Button } from './ui/button'
const schema = z.object({
  savedAt: z.number(),
  revision: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})
type Values = z.infer<typeof schema>['values']
export default function FormRecovery({
  storageKey,
  revision,
  values,
  dirty,
  onRestore,
}: {
  storageKey?: string
  revision: string
  values: Values
  dirty: boolean
  onRestore: (values: Values) => void
}) {
  const [saved, setSaved] = useState<z.infer<typeof schema> | null>(() => {
    try {
      if (!storageKey) return null
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = schema.safeParse(JSON.parse(raw))
      if (parsed.success && Date.now() - parsed.data.savedAt < 8 * 60 * 60 * 1000)
        return parsed.data
      sessionStorage.removeItem(storageKey)
    } catch {
      /* Recovery is optional; API saves remain available. */
    }
    return null
  })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!storageKey || !dirty) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), revision, values }))
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Tab recovery storage is unavailable. Save before leaving this page.')
    }
  }, [storageKey, revision, values, dirty])
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {saved && (
        <div className="my-3 rounded border border-amber-500 p-3">
          <p>
            A form draft is available in this tab.{' '}
            {saved.revision !== revision
              ? 'Saved inputs changed; download the draft and compare before re-entering it.'
              : 'Restore it to review before saving.'}
          </p>
          <Button
            variant="outline"
            disabled={saved.revision !== revision}
            onClick={() => {
              onRestore(saved.values)
              setSaved(null)
            }}
          >
            Recover form draft
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }),
              )
              const link = document.createElement('a')
              link.href = url
              link.download = 'infrashader-form-draft.json'
              link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            Download form draft
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (storageKey) sessionStorage.removeItem(storageKey)
              setSaved(null)
            }}
          >
            Discard form draft
          </Button>
        </div>
      )}
    </>
  )
}
