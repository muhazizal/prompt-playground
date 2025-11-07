// Mini Agent composable: chat behavior + Firestore history (single composable)
// Provides messages/status/input/send/preloadHistory. Uses non-stream /agent/run.
import type { AgentRunResult } from '@/helpers/types'
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

	async function send() {
		const text = input.value.trim()
		if (!text) return

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
				body: { prompt: text },
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

	async function preloadHistory(limitCount = 20) {
		try {
			if (!db) return

			const snap = await getDocs(
				query(collection(db, 'miniAgentHistory'), orderBy('createdAt', 'desc'), limit(limitCount))
			)
			const hist = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

			hist.reverse().forEach((h) => {
				const p = String(h.prompt || '')
				const a = String(h.answer || '')
				if (p) pushUserMessage(p)
				if (a) pushAssistantMessage(a)
			})
		} catch (e) {
			console.warn('[agent] preload history failed', e)
		}
	}

	return { messages, status, input, send, preloadHistory }
}
