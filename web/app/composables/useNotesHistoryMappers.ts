// Composable: Firestore snapshot mappers for notes history
// Single responsibility: convert snapshots to typed NoteResult entries.
import type { NoteResult } from '@/helpers/types'
import type { QueryDocumentSnapshot, Timestamp } from 'firebase/firestore'

export function useNotesHistoryMappers() {
  function mapSummary(doc: QueryDocumentSnapshot<NoteResult>): NoteResult {
    const data = doc.data() as any
    const updatedAt = data?.updatedAt as Timestamp | undefined
    const model = typeof data?.model === 'string' ? data.model : ''
    const summary = typeof data?.summary === 'string' ? data.summary : ''
    const file = typeof data?.file === 'string' ? data.file : doc.id
    const tags = Array.isArray(data?.tags) ? data.tags : []
    const usage = data?.usage ?? null
    const evaluation = data?.evaluation ?? null
    return { file, summary, tags, usage, evaluation, model }
  }

  return { mapSummary }
}

