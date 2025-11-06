// Composable: Firestore history saving helpers
// Single responsibility: persist history entries to collections.
import type { Firestore } from 'firebase/firestore'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import type { RunResult } from '@/helpers/types'

function cleanEntry(entry: any) {
	const cleaned: any = {}
	for (const [k, v] of Object.entries(entry || {})) {
		if (v !== undefined && v !== null) cleaned[k] = v
	}
	return cleaned
}

export function usePromptSave() {
	const nuxt = useNuxtApp()
	const db = (nuxt as any).$db as Firestore | undefined

	async function saveText(entry: {
		prompt: string
		model: string
		temperatures: number[]
		maxTokens: number
		samples: number
		runs: RunResult[]
	}) {
		if (!db) return console.warn('[saveText] missing db')
		const cleaned = cleanEntry(entry)
		await addDoc(collection(db, 'promptTextHistory'), {
			...cleaned,
			type: 'text',
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
	}

	async function saveVision(entry: {
		prompt?: string
		imageUrl?: string
		text: string
		model: string
		usage?: any
		durationMs?: number
	}) {
		if (!db) return console.warn('[saveVision] missing db')
		const cleaned = cleanEntry(entry)
		await addDoc(collection(db, 'visionHistory'), {
			...cleaned,
			type: 'vision',
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
	}

	async function saveTranscription(entry: { text: string; model: string; durationMs?: number }) {
		if (!db) return console.warn('[saveTranscription] missing db')
		const cleaned = cleanEntry(entry)
		await addDoc(collection(db, 'transcriptionHistory'), {
			...cleaned,
			type: 'stt',
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
	}

	async function saveTTS(entry: {
		text: string
		voice?: string
		model: string
		durationMs?: number
	}) {
		if (!db) return console.warn('[saveTTS] missing db')
		const cleaned = cleanEntry(entry)
		await addDoc(collection(db, 'ttsHistory'), {
			...cleaned,
			type: 'tts',
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
	}

	async function saveImageGen(entry: { prompt: string; model: string; size?: string }) {
		if (!db) return console.warn('[saveImageGen] missing db')
		const cleaned = cleanEntry(entry)
		await addDoc(collection(db, 'imageGenHistory'), {
			...cleaned,
			type: 'image',
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
	}

	return { saveText, saveVision, saveTranscription, saveTTS, saveImageGen }
}
