// Composable: Firestore persistence for notes
// Single responsibility: save NoteResult summaries uniquely by file name.
import type { NoteResult } from '@/helpers/types'
import { Firestore, setDoc, doc, serverTimestamp } from 'firebase/firestore'

export function useNotesSave() {
  const nuxt = useNuxtApp()
  const db = (nuxt as any).$db as Firestore | undefined

  async function saveSummary(r: NoteResult): Promise<void> {
    try {
      if (!db) {
        console.warn('[save] missing db')
        return
      }

      const ref = doc(db, 'notesSummaries', r.file)
      const payload: any = {
        file: r.file,
        summary: r.summary,
        tags: Array.isArray(r.tags) ? r.tags : [],
        usage: r.usage || null,
        evaluation: r.evaluation || null,
        model: r.model || null,
        updatedAt: serverTimestamp(),
      }

      await setDoc(ref, payload, { merge: true })
    } catch (e: any) {
      console.warn('[save] failed:', e?.message || e)
      throw e
    }
  }

  return { saveSummary }
}

