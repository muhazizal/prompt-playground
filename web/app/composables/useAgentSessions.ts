// Firestore-powered Mini Agent sessions management
import {
	doc,
	setDoc,
	serverTimestamp,
	getDocs,
	query,
	where,
	limit,
	collection,
	updateDoc,
	deleteDoc,
} from 'firebase/firestore'

export type AgentSession = {
	id: string
	title: string
	updatedAt?: number
	createdAt?: any
	status?: 'active' | 'archived'
}

export function useAgentSessions() {
	const nuxt = useNuxtApp()
	const db = (nuxt as any).$db
	const auth = (nuxt as any).$auth as any
	const userId: string | undefined = auth?.currentUser?.uid || undefined

	async function listSessions(limitCount = 50): Promise<AgentSession[]> {
		if (!db || !userId) return []
		try {
			// Avoid composite index requirement by removing orderBy from Firestore query,
			// then sort client-side by updatedAt desc.
			const snap = await getDocs(
				query(
					collection(db, 'sessions'),
					where('userId', '==', userId),
					where('feature', '==', 'agent'),
					limit(limitCount)
				)
			)
			const items = snap.docs.map((d) => ({
				id: d.id,
				title: (d.data() as any)?.title || 'Untitled',
				...(d.data() as any),
			}))
			items.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
			return items
		} catch (e) {
			console.warn('[agent] listSessions failed', e)
			return []
		}
	}

	async function createSession(title = 'New Chat'): Promise<AgentSession | null> {
		if (!db || !userId) {
			console.warn('[agent] Cannot create session: missing db or user')
			return null
		}
		try {
			const localId = crypto.randomUUID()
			const sessionKey = `${userId}:${localId}`
			const now = Date.now()
			const ref = doc(db, 'sessions', sessionKey)
			await setDoc(
				ref,
				{
					sessionId: sessionKey,
					userId,
					feature: 'agent',
					title,
					status: 'active',
					lastSeq: 0,
					createdAt: serverTimestamp(),
					updatedAt: now,
				},
				{ merge: true }
			)
			return { id: sessionKey, title, updatedAt: now }
		} catch (e) {
			console.warn('[agent] createSession failed', e)
			return null
		}
	}

	async function renameSession(id: string, title: string): Promise<boolean> {
		if (!db || !userId || !id) return false
		try {
			const ref = doc(db, 'sessions', id)
			await updateDoc(ref, { title, updatedAt: Date.now() })
			return true
		} catch (e) {
			console.warn('[agent] renameSession failed', e)
			return false
		}
	}

	async function deleteSession(id: string): Promise<boolean> {
		if (!db || !userId || !id) return false
		try {
			// Delete the session document
			await deleteDoc(doc(db, 'sessions', id))
			// Optionally, delete a limited number of messages to reduce leftovers
			try {
				const snap = await getDocs(query(collection(db, 'sessions', id, 'messages'), limit(200)))
				for (const d of snap.docs) {
					await deleteDoc(d.ref)
				}
			} catch (e) {
				console.warn('[agent] partial messages cleanup failed', e)
			}
			return true
		} catch (e) {
			console.warn('[agent] deleteSession failed', e)
			return false
		}
	}

	return { listSessions, createSession, renameSession, deleteSession }
}
