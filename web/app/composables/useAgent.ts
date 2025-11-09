// Mini Agent composable: chat behavior + Firestore history (single composable)
// Provides messages/status/input/send/preloadHistory. Uses non-stream /agent/run.
import type { AgentRunResult } from '@/helpers/types'
import type { Ref } from 'vue'
import {
	addDoc,
	collection,
	serverTimestamp,
	getDocs,
	query,
	orderBy,
	limit,
} from 'firebase/firestore'

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

export function useAgent() {
	const config = useRuntimeConfig()
	const nuxt = useNuxtApp()
	const db = (nuxt as any).$db
	const auth = (nuxt as any).$auth as any
	const userId: string | undefined = auth?.currentUser?.uid || undefined

	const messages = ref<any[]>([])
	const status = ref<ChatStatus>('ready')
	const input = ref('')

	function pushUserMessage(text: string) {
		messages.value.push({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] })
	}
	function pushAssistantMessage(text = '') {
		const msg = { id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text }] }
		messages.value.push(msg)
		return msg
	}
	function setAssistantText(msg: any, text: string) {
		msg.parts = [{ type: 'text', text }]
	}

	// Normalize Firestore message content to displayable text.
	function normalizeContent(content: any): string {
		// If string, attempt to parse JSON and extract `answer` field if present
		if (typeof content === 'string') {
			const s = content.trim()
			if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
				try {
					const obj = JSON.parse(s)
					if (obj && typeof obj === 'object' && typeof (obj as any).answer === 'string') {
						return String((obj as any).answer)
					}
				} catch {}
			}
			return content
		}

		// If object, prefer `answer`; otherwise stringify safely
		if (content && typeof content === 'object') {
			const ans = typeof (content as any).answer === 'string' ? (content as any).answer : null
			if (ans) return String(ans)
			if (Array.isArray(content)) {
				return content
					.map((c) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
					.join(' ')
			}
			return JSON.stringify(content)
		}

		return String(content ?? '')
	}

	async function saveRun(promptText: string, res: AgentRunResult) {
		if (!db) return console.warn('[agent] Firestore not initialized; skipping save')

		const cleaned: any = {}
		const entry: any = {
			prompt: promptText,
			answer: res?.answer,
			sources: res?.sources,
			usage: res?.usage,
			costUsd: res?.costUsd,
			durationMs: res?.durationMs,
			model: 'gpt-4o-mini',
		}

		for (const [k, v] of Object.entries(entry)) if (v !== undefined && v !== null) cleaned[k] = v

		await addDoc(collection(db, 'miniAgentHistory'), {
			...cleaned,
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
	}

	async function send(sid: string) {
		const text = input.value.trim()
		if (!text || !sid) return console.warn('[agent] send: missing text or session id')

		// Add user message
		pushUserMessage(text)
		input.value = ''

		// Assistant placeholder
		const assistantMsg = pushAssistantMessage('')
		status.value = 'submitted'

		try {
			status.value = 'streaming' // semantic; non-stream finalizes below
			const res = await $fetch<AgentRunResult>('/agent/run', {
				baseURL: config.public.apiBase,
				method: 'POST',
				body: { prompt: text, sessionId: sid || undefined },
				headers: {
					'Content-Type': 'application/json',
					...(userId ? { 'x-user-id': userId } : {}),
				},
			})
			const finalText = String(res?.answer || '')

			setAssistantText(assistantMsg, finalText)
			status.value = 'ready'
			await saveRun(text, res)
		} catch (e: any) {
			const msg = e?.data?.message || e?.message || 'Request failed'
			setAssistantText(assistantMsg, `Error: ${msg}`)
			status.value = 'error'
		}
	}

	async function preloadHistory(sid: string, limitCount = 20) {
		try {
			if (!db || !userId || !sid)
				return console.warn('[agent] preloadHistory: missing db, user id, or session id')

			const sessKey = sid.startsWith(`${userId}:`) ? sid : `${userId}:${sid}`
			const snap = await getDocs(
				query(
					collection(db, 'sessions', sessKey, 'messages'),
					orderBy('seq', 'asc'),
					limit(limitCount)
				)
			)
			const msgs = snap.docs.map((d) => d.data() as any)
			msgs.forEach((m) => {
				const text = normalizeContent(m.content)
				if (m.role === 'user') pushUserMessage(text)
				else if (m.role === 'assistant') pushAssistantMessage(text)
			})
		} catch (e) {
			console.warn('[agent] preload history failed', e)
		}
	}

	return { messages, status, input, send, preloadHistory }
}
