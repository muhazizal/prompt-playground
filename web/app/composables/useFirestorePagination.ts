/**
 * Firestore pagination composable
 * Provides cursor-based pagination using orderBy + startAfter/endBefore.
 * Works with server timestamps like `createdAt` or `updatedAt`.
 */
import type { Ref } from 'vue'
import { ref } from 'vue'
import type { Firestore, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
import {
	collection,
	query,
	orderBy,
	limit,
	startAfter,
	endBefore,
	limitToLast,
	getDocs,
} from 'firebase/firestore'

// Accept broader Firestore doc snapshot typing to avoid generic mismatches
export type MapDocFn<T> = (doc: QueryDocumentSnapshot<any>) => T

export interface UseFirestorePaginationParams<T> {
	collectionName: string
	orderField: string
	pageSize?: number
	mapDoc?: MapDocFn<T>
}

export interface UseFirestorePaginationResult<T> {
	items: Ref<T[]>
	page: Ref<number>
	loading: Ref<boolean>
	error: Ref<string | null>
	hasNext: Ref<boolean>
	hasPrev: Ref<boolean>
	loadFirst: () => Promise<void>
	loadNext: () => Promise<void>
	loadPrev: () => Promise<void>
	refresh: () => Promise<void>
}

export function useFirestorePagination<T = any>(
	params: UseFirestorePaginationParams<T>
): UseFirestorePaginationResult<T> {
	const nuxt = useNuxtApp()
	const db = (nuxt as any).$db as Firestore | undefined

	// Ensure items is typed compatibly with the result interface
	const items = ref<T[]>([]) as Ref<T[]>
	const page = ref(1)
	const loading = ref(false)
	const error = ref<string | null>(null)
	const hasNext = ref(false)
	const hasPrev = ref(false)

	const pageSize = params.pageSize ?? 10
	const orderField = params.orderField
	const mapDoc: MapDocFn<T> = params.mapDoc ?? ((doc) => ({ id: doc.id, ...(doc.data() as any) }))

	// Track cursors for current page
	// Broaden snapshot types to match Firestore generics
	let firstDoc: QueryDocumentSnapshot<any> | null = null
	let lastDoc: QueryDocumentSnapshot<any> | null = null

	async function runQuery(q: ReturnType<typeof query>) {
		loading.value = true
		error.value = null
		try {
			if (!db) {
				throw new Error('Firestore not initialized. Check public runtime firebase config.')
			}

			const snapshot = await getDocs(q)
			const docs = snapshot.docs
			// Map with relaxed typing to avoid mismatches between Firestore generics
			items.value = docs.map((d) => mapDoc(d as QueryDocumentSnapshot<any>))

			// Update cursors and flags
			firstDoc = docs.length > 0 ? (docs[0] as QueryDocumentSnapshot<any>) : null
			lastDoc = docs.length > 0 ? (docs[docs.length - 1] as QueryDocumentSnapshot<any>) : null
			hasPrev.value = page.value > 1 && !!firstDoc
			hasNext.value = docs.length === pageSize && !!lastDoc
		} catch (e: any) {
			error.value = e?.message || 'Failed to load data'
			items.value = []
			hasPrev.value = false
			hasNext.value = false
		} finally {
			loading.value = false
		}
	}

	async function loadFirst() {
		page.value = 1
		const q = query(
			collection(db!, params.collectionName),
			orderBy(orderField, 'desc'),
			limit(pageSize)
		)
		await runQuery(q)
	}

	async function loadNext() {
		if (!lastDoc) return
		page.value += 1
		const q = query(
			collection(db!, params.collectionName),
			orderBy(orderField, 'desc'),
			startAfter(lastDoc),
			limit(pageSize)
		)
		await runQuery(q)
	}

	async function loadPrev() {
		if (!firstDoc || page.value <= 1) return
		page.value = Math.max(1, page.value - 1)
		const q = query(
			collection(db!, params.collectionName),
			orderBy(orderField, 'desc'),
			endBefore(firstDoc),
			limitToLast(pageSize)
		)
		await runQuery(q)
	}

	async function refresh() {
		if (page.value === 1) return loadFirst()
		// Re-run current page using firstDoc to get consistent slice
		if (!firstDoc) return loadFirst()
		const q = query(
			collection(db!, params.collectionName),
			orderBy(orderField, 'desc'),
			endBefore(firstDoc),
			limitToLast(pageSize)
		)
		await runQuery(q)
	}

	return { items, page, loading, error, hasNext, hasPrev, loadFirst, loadNext, loadPrev, refresh }
}
