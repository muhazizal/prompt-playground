import { get_encoding } from '@dqbd/tiktoken'
import { getFirestore } from '../utils/firebase.mjs'

// In-memory chat memory store (fallback when Redis/Firebase unavailable)
const sessions = new Map() // Map<sessionId, Array<{ role, content }>>

const USE_FIREBASE = String(process.env.MEMORY_STORE || '').toLowerCase() === 'firebase'
const DEFAULT_MAX_ITEMS = Number(process.env.MEMORY_MAX_ITEMS || 200)

/** Validate message shape. */
function isValidMessage(m) {
	return m && typeof m.role === 'string' && m.role && typeof m.content !== 'undefined'
}

/** Clamp array length from the front to maxItems. */
function clampArraySize(arr, maxItems) {
	if (arr.length > maxItems) arr.splice(0, arr.length - maxItems)
	return arr
}

/** Append a message to session memory (Firestore or in-memory). */
export async function appendMessage(sessionId, msg, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
	if (!isValidMessage(msg)) return

	const key = String(sessionId || 'default')
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	try {
		const sessRef = db.collection('sessions').doc(key)
		const msgsRef = sessRef.collection('messages')
		await db.runTransaction(async (tx) => {
			const snap = await tx.get(sessRef)
			const data = snap.exists ? snap.data() : null
			const lastSeq = typeof data?.lastSeq === 'number' ? data.lastSeq : 0
			const seq = lastSeq + 1
			const now = Date.now()

			tx.set(
				sessRef,
				{ sessionId: key, lastSeq: seq, updatedAt: now, status: 'active' },
				{ merge: true }
			)
			const msgDocRef = msgsRef.doc(String(seq))
			tx.set(msgDocRef, {
				role: msg.role,
				content: msg.content,
				sessionId: key,
				seq,
				createdAt: now,
			})
		})

		return
	} catch (err) {
		console.error('[memory] Firebase append error:', err?.message || String(err))
	}

	const arr = sessions.get(key) || []
	arr.push({ role: msg.role, content: msg.content })
	clampArraySize(arr, maxItems)

	sessions.set(key, arr)
}

/** Get recent messages from session memory. */
export async function getRecentMessages(sessionId, { limit = 50 } = {}) {
	const key = String(sessionId || 'default')
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	try {
		const snap = await db
			.collection('sessions')
			.doc(key)
			.collection('messages')
			.orderBy('seq', 'desc')
			.limit(limit)
			.get()

		const list = snap.docs.map((d) => d.data())
		return list
			.map((d) => ({ role: d.role, content: d.content }))
			.filter(isValidMessage)
			.reverse()
	} catch (err) {
		console.error('[memory] Firebase getRecent error:', err?.message || String(err))
	}

	const arr = sessions.get(key) || []
	return arr.slice(-limit)
}

/** Clear all messages in a session. */
export async function clearSession(sessionId) {
	const key = String(sessionId || 'default')
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	try {
		const sessRef = db.collection('sessions').doc(key)
		const msgsRef = sessRef.collection('messages')
		const snap = await msgsRef.get()
		const batch = db.batch()
		snap.docs.forEach((doc) => batch.delete(doc.ref))
		batch.set(sessRef, { status: 'archived', lastSeq: 0, updatedAt: Date.now() }, { merge: true })
		await batch.commit()
		return
	} catch (err) {
		console.error('[memory] Firebase clear error:', err?.message || String(err))
	}

	sessions.delete(key)
}

/** Approximate token counting for messages. */
export function countMessagesTokens(messages, { tokenizer = 'cl100k_base' } = {}) {
	const enc = get_encoding(tokenizer)
	let count = 0

	// Count tokens for each message
	for (const m of messages) {
		const contentStr = Array.isArray(m.content)
			? m.content.map((c) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c))).join(' ')
			: String(m.content ?? '')

		count += enc.encode(contentStr).length + 4
	}

	return count + 2
}

/** Split messages to fit within token budget (returns kept + overflow). */
export function splitMessagesByBudget(messages, budgetTokens, { tokenizer = 'cl100k_base' } = {}) {
	const sys = messages.filter((m) => m.role === 'system')
	const others = messages.filter((m) => m.role !== 'system')
	const kept = []

	// Iterate backwards to keep as many messages as possible within budget
	for (let i = others.length - 1; i >= 0; i--) {
		kept.unshift(others[i])

		// Stop if adding this message exceeds budget
		if (countMessagesTokens([...sys, ...kept], { tokenizer }) > budgetTokens) {
			kept.shift()
			break
		}
	}

	// Calculate overflow messages
	const overflowCount = others.length - kept.length
	const overflow = overflowCount > 0 ? others.slice(0, overflowCount) : []

	return { kept: [...sys, ...kept], overflow }
}

/** Trim messages to fit within token budget (drops earliest non-system). */
export function trimMessagesToTokenBudget(
	messages,
	budgetTokens,
	{ tokenizer = 'cl100k_base' } = {}
) {
	const sys = messages.filter((m) => m.role === 'system')
	const others = messages.filter((m) => m.role !== 'system')
	let trimmed = others.slice()

	// Trim messages from start until within budget
	while (
		trimmed.length > 0 &&
		countMessagesTokens([...sys, ...trimmed], { tokenizer }) > budgetTokens
	) {
		trimmed.shift()
	}

	return [...sys, ...trimmed]
}

/** Serialize a context object safely to a compact system message. */
export function serializeContextToSystem(context) {
	try {
		const safe = JSON.stringify(context, (_k, v) => (typeof v === 'function' ? undefined : v))

		return { role: 'system', content: `Context: ${safe}` }
	} catch {
		return { role: 'system', content: 'Context unavailable' }
	}
}

/**
 * Build a normalized per-request session key.
 * - Prepends `x-user-id` if present.
 * - Avoids double-prepending when `sessionIdRaw` already starts with `userId:`.
 */
/** Build a normalized per-request session key. */
export function buildSessionKey(req, { sid, defaultScope = 'default' } = {}) {
	const userId = req.headers['x-user-id'] || null
	const rawHeader = req.headers['x-session-id']
	const fallback = req.ip || defaultScope
	const sessionIdRaw = String(sid || rawHeader || fallback || defaultScope)
	const alreadyPrefixed = userId && sessionIdRaw.startsWith(`${userId}:`)

	return userId ? (alreadyPrefixed ? sessionIdRaw : `${userId}:${sessionIdRaw}`) : sessionIdRaw
}

/** Persist a summarized context for a session in Firestore. */
export async function setSessionSummary(
	sessionId,
	summaryText,
	{ model = null, tokens = null } = {}
) {
	const key = String(sessionId || 'default')
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	try {
		const now = Date.now()
		await db
			.collection('sessions')
			.doc(key)
			.set(
				{
					sessionId: key,
					summary: { text: String(summaryText || ''), updatedAt: now, model, tokens },
					updatedAt: now,
					status: 'active',
				},
				{ merge: true }
			)
		return true
	} catch (err) {
		console.error('[memory] Firebase setSummary error:', err?.message || String(err))
		return false
	}
}

/** Retrieve a persisted summary for a session from Firestore. */
export async function getSessionSummary(sessionId) {
	const key = String(sessionId || 'default')
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	try {
		const doc = await db.collection('sessions').doc(key).get()
		if (!doc.exists) return null
		const data = doc.data() || {}
		return data.summary || null
	} catch (err) {
		console.error('[memory] Firebase getSummary error:', err?.message || String(err))
		return null
	}
}
