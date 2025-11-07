import { createClient } from 'redis'
import { get_encoding } from '@dqbd/tiktoken'
import { getFirestore } from '../utils/firebase.mjs'

// In-memory chat memory store (fallback when Redis/Firebase unavailable)
const sessions = new Map() // Map<sessionId, Array<{ role, content }>>

// Optional Redis-backed store
const USE_REDIS = String(process.env.MEMORY_STORE || '').toLowerCase() === 'redis'
const USE_FIREBASE = String(process.env.MEMORY_STORE || '').toLowerCase() === 'firebase'
const DEFAULT_TTL_SECONDS = Number(process.env.MEMORY_TTL_SECONDS || 86400)
const DEFAULT_MAX_ITEMS = Number(process.env.MEMORY_MAX_ITEMS || 200)
let redisClientPromise = null

/** Get Redis client if enabled; returns null on error. */
async function getRedis() {
	if (!USE_REDIS) return null
	if (redisClientPromise) return redisClientPromise

	const url = process.env.REDIS_URL || 'redis://localhost:6379'
	const client = createClient({ url })

	redisClientPromise = client
		.connect()
		.then(() => client)
		.catch((err) => {
			console.error('[memory] Redis connect error:', err?.message || String(err))
			return null
		})

	return redisClientPromise
}

/** Validate message shape. */
function isValidMessage(m) {
	return m && typeof m.role === 'string' && m.role && typeof m.content !== 'undefined'
}

/** Safe JSON parse with fallback. */
function safeJsonParse(str, fallback = null) {
	try {
		return JSON.parse(str)
	} catch {
		return fallback
	}
}

/** Clamp array length from the front to maxItems. */
function clampArraySize(arr, maxItems) {
	if (arr.length > maxItems) arr.splice(0, arr.length - maxItems)
	return arr
}

/** Append a message to session memory (Redis or in-memory). */
export async function appendMessage(
	sessionId,
	msg,
	{ maxItems = DEFAULT_MAX_ITEMS, ttlSec = DEFAULT_TTL_SECONDS } = {}
) {
	if (!isValidMessage(msg)) return

	const key = String(sessionId || 'default')
	const r = await getRedis()
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	if (r) {
		try {
			const val = JSON.stringify({ role: msg.role, content: msg.content })

			await r.rPush(key, val)
			await r.lTrim(key, -maxItems, -1)
			await r.expire(key, ttlSec)

			return
		} catch (err) {
			console.error('[memory] Redis append error:', err?.message || String(err))
		}
	}

	if (db) {
		try {
			const msgsRef = db.collection('sessions').doc(key).collection('messages')
			const lastSnap = await msgsRef.orderBy('seq', 'desc').limit(1).get()
			const lastSeq = lastSnap.empty ? 0 : lastSnap.docs[0].data().seq || 0
			const now = Date.now()

			await msgsRef.add({
				role: msg.role,
				content: msg.content,
				sessionId: key,
				seq: lastSeq + 1,
				createdAt: now,
			})

			await db
				.collection('sessions')
				.doc(key)
				.set({ sessionId: key, updatedAt: now, status: 'active' }, { merge: true })

			return
		} catch (err) {
			console.error('[memory] Firebase append error:', err?.message || String(err))
		}
	}

	const arr = sessions.get(key) || []
	arr.push({ role: msg.role, content: msg.content })
	clampArraySize(arr, maxItems)

	sessions.set(key, arr)
}

/** Get recent messages from session memory. */
export async function getRecentMessages(sessionId, { limit = 50 } = {}) {
	const key = String(sessionId || 'default')
	const r = await getRedis()
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	if (r) {
		try {
			const len = await r.lLen(key)

			if (!len || len <= 0) return []

			const start = Math.max(0, len - limit)
			const list = await r.lRange(key, start, len - 1)

			return list.map((s) => safeJsonParse(s, null)).filter(isValidMessage)
		} catch (err) {
			console.error('[memory] Redis getRecent error:', err?.message || String(err))
			return []
		}
	}

	if (db) {
		try {
			const snap = await db
				.collection('sessions')
				.doc(key)
				.collection('messages')
				.orderBy('createdAt', 'desc')
				.limit(limit)
				.get()

			const list = snap.docs.map((d) => d.data())
			return list
				.map((d) => ({ role: d.role, content: d.content }))
				.filter(isValidMessage)
				.reverse()
		} catch (err) {
			console.error('[memory] Firebase getRecent error:', err?.message || String(err))
			return []
		}
	}

	const arr = sessions.get(key) || []
	return arr.slice(-limit)
}

/** Clear all messages in a session. */
export async function clearSession(sessionId) {
	const key = String(sessionId || 'default')
	const r = await getRedis()
	const db = USE_FIREBASE ? await getFirestore().catch(() => null) : null

	if (r) {
		try {
			await r.del(key)
		} catch (err) {
			console.error('[memory] Redis clear error:', err?.message || String(err))
		}

		return
	}

	if (db) {
		try {
			const msgsRef = db.collection('sessions').doc(key).collection('messages')
			const snap = await msgsRef.get()
			const batch = db.batch()
			snap.docs.forEach((doc) => batch.delete(doc.ref))
			batch.set(
				db.collection('sessions').doc(key),
				{ status: 'archived', updatedAt: Date.now() },
				{ merge: true }
			)
			await batch.commit()
			return
		} catch (err) {
			console.error('[memory] Firebase clear error:', err?.message || String(err))
		}
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
