// Composable: History mappers for Firestore docs
// Single responsibility: map snapshots to typed entries.
import type { QueryDocumentSnapshot, Timestamp } from 'firebase/firestore'
import type {
	HistoryEntry,
	VisionHistory,
	TranscriptionHistory,
	TTSHistory,
	ImageGenHistory,
} from '@/helpers/types'

export function usePromptHistoryMappers() {
	function mapPlayground(doc: QueryDocumentSnapshot<any>): HistoryEntry {
		const data = doc.data() as any
		const createdAt = data?.createdAt as Timestamp | undefined
		const at = createdAt?.toDate?.() ? createdAt.toDate().getTime() : data?.at ?? Date.now()
		return { id: doc.id, ...data, at } as HistoryEntry
	}

	function mapVision(doc: QueryDocumentSnapshot<any>): VisionHistory {
		const data = doc.data() as any
		return { id: doc.id, ...data } as VisionHistory
	}

	function mapTranscription(doc: QueryDocumentSnapshot<any>): TranscriptionHistory {
		const data = doc.data() as any
		return { id: doc.id, ...data } as TranscriptionHistory
	}

	function mapTTS(doc: QueryDocumentSnapshot<any>): TTSHistory {
		const data = doc.data() as any
		return { id: doc.id, ...data } as TTSHistory
	}

	function mapImageGen(doc: QueryDocumentSnapshot<any>): ImageGenHistory {
		const data = doc.data() as any
		return { id: doc.id, ...data } as ImageGenHistory
	}

	return { mapPlayground, mapVision, mapTranscription, mapTTS, mapImageGen }
}
