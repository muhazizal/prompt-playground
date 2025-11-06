import fs from 'fs'
import path from 'path'
import { get_encoding } from '@dqbd/tiktoken'
import { CACHE_DIR } from './notes-core.mjs'
import { createClient } from 'redis'

// Persistent chat memory store (in-memory with disk sync)
const MEMORY_FILE = path.join(CACHE_DIR, 'chat_memory.json')
const sessions = new Map() // Map<sessionId, Array<{ role, content }>>
let loaded = false
let saveTimer = null

// Optional Redis-backed store
const USE_REDIS = String(process.env.MEMORY_STORE || '').toLowerCase() === 'redis'
const DEFAULT_TTL_SECONDS = Number(process.env.MEMORY_TTL_SECONDS || 86400)
const DEFAULT_MAX_ITEMS = Number(process.env.MEMORY_MAX_ITEMS || 200)
let redisClientPromise = null

// Initialize Redis client if enabled
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

// Ensure cache directory exists
function ensureCacheDir() {
	if (!fs.existsSync(CACHE_DIR)) {
		fs.mkdirSync(CACHE_DIR, { recursive: true })
	}
}

// Load memory from disk on-demand
export function loadMemoryFromDisk() {
	if (loaded) return

	ensureCacheDir()

	if (fs.existsSync(MEMORY_FILE)) {
		try {
			const raw = fs.readFileSync(MEMORY_FILE, 'utf-8')
			const disk = JSON.parse(raw)

			// Deserialize sessions from disk
			for (const [key, arr] of Object.entries(disk || {})) {
				if (Array.isArray(arr)) sessions.set(key, arr.filter(isValidMessage))
			}
		} catch {}
	}

	loaded = true
}

// Schedule disk save after 500ms of inactivity
function scheduleSave() {
	if (saveTimer) clearTimeout(saveTimer)

	saveTimer = setTimeout(saveMemoryToDisk, 500)
}

// Save memory to disk
export function saveMemoryToDisk() {
	ensureCacheDir()

	const obj = {}

	// Serialize sessions to disk
	for (const [key, arr] of sessions.entries()) {
		obj[key] = arr.slice(-200) // clamp per-session size on disk
	}

	try {
		fs.writeFileSync(MEMORY_FILE, JSON.stringify(obj, null, 2))
	} catch {}
}

// Validate message shape
function isValidMessage(m) {
	return m && typeof m.role === 'string' && m.role && typeof m.content !== 'undefined'
}

// Append message to session memory
export async function appendMessage(
	sessionId,
	msg,
	{ maxItems = DEFAULT_MAX_ITEMS, ttlSec = DEFAULT_TTL_SECONDS } = {}
) {
	loadMemoryFromDisk()

	if (!isValidMessage(msg)) return

	const key = String(sessionId || 'default')
	const r = await getRedis()

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

	const arr = sessions.get(key) || []
	arr.push({ role: msg.role, content: msg.content })

	// Clamp session size
	if (arr.length > maxItems) arr.splice(0, arr.length - maxItems)

	sessions.set(key, arr)
	scheduleSave()
}

// Get recent messages from session memory
export async function getRecentMessages(sessionId, { limit = 50 } = {}) {
	loadMemoryFromDisk()

	const key = String(sessionId || 'default')
	const r = await getRedis()

	if (r) {
		try {
			const len = await r.lLen(key)

			if (!len || len <= 0) return []

			const start = Math.max(0, len - limit)
			const list = await r.lRange(key, start, len - 1)

			return list
				.map((s) => {
					try {
						return JSON.parse(s)
					} catch {
						return null
					}
				})
				.filter(isValidMessage)
		} catch (err) {
			console.error('[memory] Redis getRecent error:', err?.message || String(err))
			return []
		}
	}

	const arr = sessions.get(key) || []
	return arr.slice(-limit)
}

// Clear session memory
export async function clearSession(sessionId) {
	loadMemoryFromDisk()

	const key = String(sessionId || 'default')
	const r = await getRedis()

	if (r) {
		try {
			await r.del(key)
		} catch (err) {
			console.error('[memory] Redis clear error:', err?.message || String(err))
		}

		return
	}

	sessions.delete(key)
	scheduleSave()
}

// Approximate token counting and trimming for messages
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

// Split messages into chunks fitting within token budget
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

// Trim messages to fit within token budget
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

/** Serialize context object safely to a compact system message */
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
export function buildSessionKey(req, { sid, defaultScope = 'default' } = {}) {
	const userId = req.headers['x-user-id'] || null
	const rawHeader = req.headers['x-session-id']
	const fallback = req.ip || defaultScope
	const sessionIdRaw = String(sid || rawHeader || fallback || defaultScope)
	const alreadyPrefixed = userId && sessionIdRaw.startsWith(`${userId}:`)

	return userId ? (alreadyPrefixed ? sessionIdRaw : `${userId}:${sessionIdRaw}`) : sessionIdRaw
}
