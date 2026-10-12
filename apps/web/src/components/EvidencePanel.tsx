import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { request } from '../services/api'
import { Button } from './ui/button'
const evidenceSchema = z.object({ id: z.uuid(), description: z.string(), source_note: z.string(), content_type: z.string(), size_bytes: z.number(), sha256: z.string(), created_at: z.string() })
const listSchema = z.object({ items: z.array(evidenceSchema), limit: z.number() })
export default function EvidencePanel({ project, token }: { project: Project; token: string | undefined }) {
  const [items,setItems]=useState<z.infer<typeof evidenceSchema>[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const endpoint=`/api/v1/organisations/${project.organisation_id}/projects/${project.id}/evidence`
  useEffect(() => { let active=true; request(endpoint,listSchema,token).then(result=>{if(active)setItems(result.items)}).catch(reason=>{if(active)setError(reason.message)}); return ()=>{active=false} },[endpoint,token])
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget; setBusy(true); setError('')
    try { const saved=await request(endpoint,evidenceSchema,token,{method:'POST',body:new FormData(form)}); setItems(previous=>[saved,...previous]); form.reset() }
    catch(reason){setError(reason instanceof Error?reason.message:'Upload failed; retry with the photo and its source.')}
    finally{setBusy(false)}
  }
  async function download(id:string) {
    setBusy(true);setError('')
    try { const response=await fetch(`${import.meta.env.VITE_API_BASE_URL??''}${endpoint}/${id}/content`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)}); if(!response.ok)throw new Error('Private photo unavailable or access denied. Retry after checking your session.'); const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=`evidence-${id}.jpg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000) }
    catch(reason){setError(reason instanceof Error?reason.message:'Download failed.')}
    finally{setBusy(false)}
  }
  return <details className="my-6 rounded-lg border border-stone-300 p-4"><summary>Private site evidence</summary><p>PNG/JPEG photos, up to 10 MiB and 16 million pixels. Photos are re-encoded to remove embedded EXIF/GPS metadata. Record location and source explicitly where needed.</p>{error&&<p className="notice error" role="alert">{error}</p>}<form onSubmit={event=>void upload(event)} className="grid gap-3"><label>Photo<input name="photo" type="file" accept="image/png,image/jpeg" required /></label><label>Photo description<input name="description" maxLength={2000} required /></label><label>Source, date and permission note<input name="source_note" maxLength={2000} required /></label><label><input name="rights_confirmed" type="checkbox" value="true" required /> I have permission to store and use this photo.</label><Button disabled={busy||project.archived}>Upload private photo</Button></form>{items.map(item=><article key={item.id} className="border-t border-stone-200 py-3"><strong>{item.description}</strong><p>{item.source_note} · {item.created_at}</p><Button variant="outline" disabled={busy} onClick={()=>void download(item.id)}>Download photo</Button></article>)}</details>
}
