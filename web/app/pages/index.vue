<script setup lang="ts">
import { Firestore } from 'firebase/firestore'
import { getDocs, addDoc, collection, serverTimestamp } from 'firebase/firestore'

import { temperatureOptions } from '@/helpers/constants'
import { handleFileReader } from '@/helpers/functions'
import type {
	RunResult,
	HistoryEntry,
	TaskOption,
	VisionHistory,
	TranscriptionHistory,
	TTSHistory,
	ImageGenHistory,
} from '@/helpers/types'

const toast = useToast()

// Runtime config
const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

// Task-based selection
const taskOptions = ref<Array<TaskOption>>([])
const selectedTask = ref<TaskOption>({
	label: 'Text Generation',
	task: 'text-generation',
	model: 'gpt-4o-mini',
})

// Prompt state
const prompt = ref('')
// Backing model derived from selected task
const model = computed(() => ({ label: selectedTask.value.label, value: selectedTask.value.model }))
const maxTokens = ref(200)
const samples = ref(2)
const temperatureSelection = ref<Array<{ label: string; value: number }>>([
	{ label: '0.50', value: 0.5 },
])
const loading = ref(false)
const loadingModels = ref(false)
const error = ref<string | null>(null)
const responseText = ref('')

// Media inputs
const imageUrl = ref<string>('')
const imageBase64 = ref<string>('')
const audioBase64 = ref<string>('')
const ttsAudioUrl = ref<string>('')
const ttsVoice = ref<string>('alloy')
const generatedImageUrl = ref<string>('')
const imageSizeOptions = ['1024x1024', '1024x1536', '1536x1024', 'auto']
const imageSize = ref<string>('1024x1024')

// Output state
const outputRunPrompt = ref<HistoryEntry>()
const history = ref<HistoryEntry[]>([])
const visionHistory = ref<VisionHistory[]>([])
const transcriptionHistory = ref<TranscriptionHistory[]>([])
const ttsHistory = ref<TTSHistory[]>([])
const imageGenHistory = ref<ImageGenHistory[]>([])
const useStreaming = ref(false)

// Init Firestore
const nuxt = useNuxtApp()
const db = (nuxt as any).$db as Firestore | undefined

// Save a record to Firestore
async function saveRecord(entry: {
	prompt: string
	model: string
	temperatures: number[]
	maxTokens: number
	samples: number
	runs: RunResult[]
}) {
	try {
		if (!db) return console.warn('[save] missing db')

		// Add document to Firestore collection 'playground'
		await addDoc(collection(db, 'playground'), {
			...entry,
			createdAt: serverTimestamp(),
		})
	} catch (e: any) {
		console.warn('[save] failed:', e?.message || e)
		toast.add({
			title: 'Failed to save record',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
		return
	}
}

// Run a prompt and save the result to Firestore
async function runPrompt() {
	loading.value = true

	responseText.value = ''
	outputRunPrompt.value = undefined
	generatedImageUrl.value = ''
	ttsAudioUrl.value = ''

	error.value = null

	try {
		// Branch by task
		switch (selectedTask.value.task) {
			case 'text-generation': {
				if (!useStreaming.value) {
					// Non-streaming or image provided via base64 only
					const body: any = {
						prompt: prompt.value,
						model: model.value.value,
						maxTokens: maxTokens.value,
						n: samples.value,
					}
					body.temperatures = temperatureSelection.value.length
						? temperatureSelection.value.map((t) => t.value)
						: [0.5]

					// Run the prompt
					const res = await $fetch(`${apiBase}/prompt/chat`, { method: 'POST', body })
					const data = res as any

					// Process the response
					const runs: RunResult[] = Array.isArray(data?.runs) ? data.runs : []
					responseText.value = runs
						.flatMap((r) =>
							r.choices.map((c) => `T=${r.temperature.toFixed(2)} [${c.index + 1}]: ${c.text}`)
						)
						.join('\n\n')

					// Save the record
					const entry = {
						prompt: prompt.value,
						model: model.value.value,
						temperatures: temperatureSelection.value.map((t) => t.value),
						maxTokens: maxTokens.value,
						samples: samples.value,
						runs,
						at: Date.now(),
					}
					outputRunPrompt.value = entry
					await saveRecord(entry)
				} else {
					await streamPrompt()
				}
				break
			}
			case 'image-vision': {
				// Run the image vision prompt
				const res = await $fetch(`${apiBase}/prompt/vision`, {
					method: 'POST',
					body: {
						imageUrl: imageUrl.value || undefined,
						imageBase64: imageBase64.value || undefined,
						prompt: prompt.value || 'Describe the image.',
						model: model.value.value,
						maxTokens: maxTokens.value,
					},
				})
				const data = res as any
				responseText.value = data?.text || ''
				// Save history (avoid large binaries; only store imageUrl if present)
				await saveVisionRecord({
					prompt: prompt.value || undefined,
					imageUrl: imageUrl.value || undefined,
					text: data?.text || '',
					model: model.value.value,
					usage: data?.usage,
					durationMs: data?.durationMs,
				})
				break
			}
			case 'speech-to-text': {
				// Run the speech-to-text prompt
				const res = await $fetch(`${apiBase}/prompt/speech-to-text`, {
					method: 'POST',
					body: { audioBase64: audioBase64.value, model: model.value.value },
				})
				const data = res as any
				responseText.value = data?.text || ''
				await saveTranscriptionRecord({
					text: data?.text || '',
					model: data?.model || model.value.value,
					durationMs: data?.durationMs,
				})
				break
			}
			case 'text-to-speech': {
				// Run the text-to-speech prompt
				const res = await $fetch(`${apiBase}/prompt/text-to-speech`, {
					method: 'POST',
					body: {
						text: prompt.value,
						model: model.value.value,
						voice: ttsVoice.value,
						format: 'mp3',
					},
				})
				const data = res as any

				// Process the response
				if (typeof data?.audioBase64 === 'string') {
					ttsAudioUrl.value = `data:${data?.contentType || 'audio/mpeg'};base64,${data.audioBase64}`
					responseText.value = 'Speech generated successfully.'
				} else {
					responseText.value = 'Failed to generate speech.'
				}
				await saveTTSRecord({
					text: prompt.value,
					voice: ttsVoice.value,
					model: data?.model || model.value.value,
					durationMs: data?.durationMs,
				})
				break
			}
			case 'image-generation': {
				// Generate an image from prompt
				const res = await $fetch(`${apiBase}/prompt/image-generation`, {
					method: 'POST',
					body: {
						prompt: prompt.value,
						model: model.value.value,
						size: imageSize.value,
						format: 'png',
					},
				})
				const data = res as any
				const b64 = data?.imageBase64
				if (typeof b64 === 'string' && b64) {
					generatedImageUrl.value = `data:image/png;base64,${b64}`
					responseText.value = 'Image generated successfully.'
				} else {
					generatedImageUrl.value = ''
					responseText.value = 'Failed to generate image.'
				}
				await saveImageGenRecord({
					prompt: prompt.value,
					model: data?.model || model.value.value,
					size: imageSize.value,
				})
				break
			}
		}

		toast.add({
			title: 'Prompt run successfully',
			description: 'Check history for details.',
			color: 'success',
		})
	} catch (e: any) {
		error.value = e?.data?.error || e?.message || 'Request failed'
		toast.add({
			title: 'Failed to run prompt',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	} finally {
		loading.value = false
	}
}

// Stream exactly one temperature and return a RunResult
function streamOnce(temp: number) {
	return new Promise<RunResult>((resolve, reject) => {
		let url =
			`${apiBase}/prompt/chat/stream?` +
			`prompt=${encodeURIComponent(prompt.value)}` +
			`&model=${encodeURIComponent(model.value.value)}` +
			`&temperature=${encodeURIComponent(temp)}` +
			`&maxTokens=${encodeURIComponent(maxTokens.value)}`

		const es = new EventSource(url)

		let started = 0
		let buffer = ''
		let usage: any = null
		let completed = false

		es.addEventListener('open', () => {
			started = Date.now()

			// Show which temperature is currently streaming
			responseText.value = `T=${temp.toFixed(2)}: `
		})

		// Accumulate summary chunks into responseText for live feedback
		es.addEventListener('summary', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				if (typeof data?.chunk === 'string') {
					buffer += data.chunk
					responseText.value = `T=${temp.toFixed(2)}: ` + buffer
				}
			} catch {}
		})

		// Final text
		es.addEventListener('result', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				if (typeof data?.text === 'string') buffer = data.text
			} catch {}
		})

		// Usage tokens
		es.addEventListener('usage', (ev: MessageEvent) => {
			try {
				usage = JSON.parse(ev.data)
			} catch {}
		})

		// Server error event from API
		es.addEventListener('server_error', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				error.value = data?.error || 'Server error'
			} catch {
				error.value = 'Server error'
			}
			es.close()
			reject(new Error(error.value || 'Server error'))
		})

		// Network error (ignore if already completed)
		es.addEventListener('error', () => {
			if (completed) {
				es.close()
				return
			}
			console.warn('Stream connection error')
			es.close()
			reject(new Error('Stream connection error'))
		})

		// End of stream: return single RunResult
		es.addEventListener('end', () => {
			completed = true
			const durationMs = started ? Date.now() - started : 0
			const run: RunResult = {
				temperature: temp,
				choices: [{ index: 0, text: buffer }],
				usage,
				durationMs,
			}
			es.close()
			resolve(run)
		})
	})
}

// Stream across multiple temperatures sequentially and save a single history entry
async function streamPrompt() {
	const temps = temperatureSelection.value.length
		? temperatureSelection.value.map((t) => t.value)
		: [0.5]

	const runs: RunResult[] = []
	for (const temp of temps) {
		try {
			const run = await streamOnce(temp)
			runs.push(run)
		} catch (e: any) {
			const msg = e?.message || 'Streaming failed'
			toast.add({
				title: 'Stream failed',
				description: `T=${temp.toFixed(2)}: ${msg}`,
				color: 'error',
			})
			// Continue to next temperature
		}
	}

	if (runs.length === 0) {
		error.value = 'All streams failed'
		return
	}

	// Display aggregated output in responseText
	responseText.value = runs
		.map((r) => `T=${r.temperature.toFixed(2)} [1]: ${r.choices?.[0]?.text ?? ''}`)
		.join('\n\n')

	const entry = {
		prompt: prompt.value,
		model: model.value.value,
		temperatures: runs.map((r) => r.temperature),
		maxTokens: maxTokens.value,
		samples: 1,
		runs,
		at: Date.now(),
	}
	outputRunPrompt.value = entry
	await saveRecord(entry)
}

// Load available models from API
async function handleLoadModel() {
	loadingModels.value = true
	try {
		const res = await $fetch(`${apiBase}/prompt/models`)
		const list = (res as any)?.models

		// Validate server response
		if (Array.isArray(list) && list.length > 0) {
			// Normalize server models to task options
			taskOptions.value = list.map((m: any) => ({
				label: m.label || 'Task',
				task: /image.*generation/i.test(m.label)
					? 'image-generation'
					: /vision/i.test(m.label)
					? 'image-vision'
					: /speech.*text/i.test(m.label)
					? 'speech-to-text'
					: /text.*speech/i.test(m.label)
					? 'text-to-speech'
					: 'text-generation',
				model: m.value,
			}))

			// Default selection
			if (taskOptions.value[0]) {
				selectedTask.value = taskOptions.value[0]
			}
		}
	} catch (e: any) {
		console.warn('[load models] failed:', e?.message || e)
		toast.add({
			title: 'Failed to load models',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	} finally {
		loadingModels.value = false
	}
}

// Handle image file change
const handleChangeImage = async (e: Event) => {
	imageBase64.value = await handleFileReader(e)
}

// Handle audio file change
const handleChangeAudio = async (e: Event) => {
	audioBase64.value = await handleFileReader(e)
}

// Load history from Firestore
async function handleLoadHistory() {
	try {
		if (!db) return console.warn('[save] missing db')

		const querySnapshot = await getDocs(collection(db, 'playground'))
		const list = querySnapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		})) as HistoryEntry[]

		if (Array.isArray(list) && list.length > 0) {
			history.value = list
		}
	} catch (e: any) {
		console.warn('[load history] failed:', e?.message || e)
		toast.add({
			title: 'Failed to load history',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	} finally {
		loading.value = false
	}
}

// Save: Vision
async function saveVisionRecord(entry: {
	prompt?: string
	imageUrl?: string
	text: string
	model: string
	usage?: any
	durationMs?: number
}) {
	try {
		if (!db) return console.warn('[save vision] missing db')
		await addDoc(collection(db, 'visionHistory'), {
			...entry,
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
		await handleLoadVisionHistory()
	} catch (e: any) {
		console.warn('[save vision] failed:', e?.message || e)
	}
}

// Save: Transcription
async function saveTranscriptionRecord(entry: {
	text: string
	model: string
	durationMs?: number
}) {
	try {
		if (!db) return console.warn('[save transcription] missing db')
		await addDoc(collection(db, 'transcriptionHistory'), {
			...entry,
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
		await handleLoadTranscriptionHistory()
	} catch (e: any) {
		console.warn('[save transcription] failed:', e?.message || e)
	}
}

// Save: TTS (metadata only; audio not persisted to avoid large docs)
async function saveTTSRecord(entry: {
	text: string
	voice?: string
	model: string
	durationMs?: number
}) {
	try {
		if (!db) return console.warn('[save tts] missing db')
		await addDoc(collection(db, 'ttsHistory'), {
			...entry,
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
		await handleLoadTTSHistory()
	} catch (e: any) {
		console.warn('[save tts] failed:', e?.message || e)
	}
}

// Save: Image Generation (metadata only)
async function saveImageGenRecord(entry: { prompt: string; model: string; size?: string }) {
	try {
		if (!db) return console.warn('[save image gen] missing db')
		await addDoc(collection(db, 'imageGenHistory'), {
			...entry,
			at: Date.now(),
			createdAt: serverTimestamp(),
		})
		await handleLoadImageGenHistory()
	} catch (e: any) {
		console.warn('[save image gen] failed:', e?.message || e)
	}
}

// Load: Vision
async function handleLoadVisionHistory() {
	try {
		if (!db) return console.warn('[load vision] missing db')
		const qs = await getDocs(collection(db, 'visionHistory'))
		const list = qs.docs.map((d) => ({ id: d.id, ...d.data() })) as VisionHistory[]
		visionHistory.value = Array.isArray(list) ? list : []
	} catch (e: any) {
		console.warn('[load vision] failed:', e?.message || e)
	}
}

// Load: Transcriptions
async function handleLoadTranscriptionHistory() {
	try {
		if (!db) return console.warn('[load transcription] missing db')
		const qs = await getDocs(collection(db, 'transcriptionHistory'))
		const list = qs.docs.map((d) => ({ id: d.id, ...d.data() })) as TranscriptionHistory[]
		transcriptionHistory.value = Array.isArray(list) ? list : []
	} catch (e: any) {
		console.warn('[load transcription] failed:', e?.message || e)
	}
}

// Load: TTS
async function handleLoadTTSHistory() {
	try {
		if (!db) return console.warn('[load tts] missing db')
		const qs = await getDocs(collection(db, 'ttsHistory'))
		const list = qs.docs.map((d) => ({ id: d.id, ...d.data() })) as TTSHistory[]
		ttsHistory.value = Array.isArray(list) ? list : []
	} catch (e: any) {
		console.warn('[load tts] failed:', e?.message || e)
	}
}

// Load: Image Generation
async function handleLoadImageGenHistory() {
	try {
		if (!db) return console.warn('[load image gen] missing db')
		const qs = await getDocs(collection(db, 'imageGenHistory'))
		const list = qs.docs.map((d) => ({ id: d.id, ...d.data() })) as ImageGenHistory[]
		imageGenHistory.value = Array.isArray(list) ? list : []
	} catch (e: any) {
		console.warn('[load image gen] failed:', e?.message || e)
	}
}

async function handleLoadAllHistory() {
	await Promise.all([
		handleLoadHistory(),
		handleLoadVisionHistory(),
		handleLoadTranscriptionHistory(),
		handleLoadTTSHistory(),
		handleLoadImageGenHistory(),
	])
}

// Load models and history on mount
onMounted(async () => {
	await handleLoadModel()
	await handleLoadAllHistory()
})

// Copy text to clipboard
function copyText(text: string) {
	try {
		navigator.clipboard?.writeText(text)
		toast.add({
			title: 'Copied to clipboard',
			description: 'The text has been copied to the clipboard.',
			color: 'success',
		})
	} catch (e) {
		console.warn('Clipboard copy failed', e)
		toast.add({
			title: 'Clipboard copy failed',
			description: 'Unknown error',
			color: 'error',
		})
	}
}

const handleClearOutput = () => {
	responseText.value = ''
	outputRunPrompt.value = undefined
	generatedImageUrl.value = ''
	ttsAudioUrl.value = ''

	error.value = null
}

watch(
	() => error.value,
	(err) => {
		if (err) {
			setTimeout(() => {
				error.value = ''
			}, 5000)
		}
	}
)
</script>

<template>
	<UContainer class="py-8">
		<!-- Header -->
		<div class="mb-6 space-y-1">
			<h1 class="text-2xl font-semibold">Prompt Playground</h1>
			<p class="text-sm text-grey-700">Compare prompt outputs across temperatures and samples.</p>
		</div>

		<UCard>
			<div class="grid gap-6">
				<!-- Prompt Input -->
				<div class="flex flex-col w-full">
					<strong>Prompt Input</strong>
					<div class="text-xs text-gray-600 mb-3 mt-1">Enter your prompt here.</div>
					<UTextarea v-model="prompt" :rows="6" placeholder="Write your prompt here" />
				</div>

				<div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
					<!-- Models -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<strong class="text-sm">Task</strong>
							<span class="text-xs text-gray-500">{{ selectedTask.model }}</span>
						</div>
						<USelectMenu
							v-model="selectedTask"
							:items="taskOptions"
							:disabled="loadingModels"
							:loading="loadingModels"
							class="w-full"
						/>
					</div>
					<!-- Temperatures -->
					<div v-if="selectedTask.task === 'text-generation'">
						<div class="flex items-center justify-between mb-1">
							<strong class="text-sm">Temperatures</strong>
							<span class="text-xs text-gray-500">{{
								temperatureSelection.map((t) => t.label).join(', ') || 'None'
							}}</span>
						</div>
						<USelectMenu
							v-model="temperatureSelection"
							:items="temperatureOptions"
							multiple
							class="w-full"
						/>
					</div>
					<!-- Samples -->
					<div v-if="selectedTask.task === 'text-generation' && !useStreaming">
						<div class="flex items-center justify-between mb-1">
							<strong class="text-sm">Samples</strong>
							<span class="text-sm">{{ samples }}</span>
						</div>
						<USlider v-model="samples" :min="1" :max="5" :step="1" />
					</div>
					<!-- Max Tokens (text & vision only) -->
					<div v-if="['text-generation', 'image-vision'].includes(selectedTask.task)">
						<div class="flex items-center justify-between mb-1">
							<strong class="text-sm">Max Tokens</strong>
							<span class="text-sm">{{ maxTokens }}</span>
						</div>
						<USlider v-model="maxTokens" :min="32" :max="1024" :step="16" />
					</div>
				</div>

				<!-- Task-specific inputs -->
				<div class="grid gap-4">
					<!-- Text Generation has no additional media inputs -->

					<div v-if="selectedTask.task === 'image-vision'">
						<div class="grid gap-6">
							<div class="flex flex-col w-full">
								<strong>Image URL</strong>
								<div class="text-xs text-gray-600 mb-3 mt-1">
									Enter the URL of the image to use with the prompt.
								</div>
								<UInput v-model="imageUrl" placeholder="https://example.com/image.jpg" />
							</div>
							<div class="flex flex-col w-full">
								<strong>Or Upload Image</strong>
								<div class="text-xs text-gray-600 mb-3 mt-1">
									Upload an image file to use with the prompt.
								</div>
								<UInput type="file" accept="image/*" @change="handleChangeImage" />
							</div>
						</div>
					</div>

					<div v-if="selectedTask.task === 'speech-to-text'">
						<div class="grid gap-3">
							<div class="flex flex-col w-full">
								<strong>Upload Audio</strong>
								<div class="text-xs text-gray-600 mb-3 mt-1">
									Upload an audio file to use with the prompt.
								</div>
								<UInput type="file" accept="audio/*" @change="handleChangeAudio" />
							</div>
						</div>
					</div>

					<div v-if="selectedTask.task === 'text-to-speech'">
						<div class="grid gap-3">
							<div class="flex flex-col w-full">
								<strong>Voice</strong>
								<div class="text-xs text-gray-600 mb-3 mt-1">
									Enter the voice to use with the prompt.
								</div>
								<UInput v-model="ttsVoice" placeholder="alloy" />
							</div>
						</div>
					</div>

					<div v-if="selectedTask.task === 'image-generation'">
						<div class="grid gap-3">
							<div class="flex flex-col w-full">
								<strong>Size</strong>
								<div class="text-xs text-gray-600 mb-3 mt-1">Larger sizes may take longer.</div>
								<USelectMenu v-model="imageSize" :items="imageSizeOptions" />
							</div>
						</div>
					</div>
				</div>

				<!-- Run Prompt Button -->
				<div class="flex gap-3 items-center justify-end">
					<USwitch
						v-if="selectedTask.task === 'text-generation'"
						v-model="useStreaming"
						checked-icon="i-heroicons-wifi"
						unchecked-icon="i-heroicons-no-symbol"
						label="Stream Prompt"
						description="Real-time result"
					/>
					<UButton class="h-full" :loading="loading" icon="i-heroicons-play" @click="runPrompt"
						>Run Prompt</UButton
					>
					<UButton
						class="h-full"
						color="neutral"
						variant="soft"
						icon="i-heroicons-x-mark"
						@click="handleClearOutput"
						>Clear Output</UButton
					>
				</div>

				<!-- Error Alert -->
				<UAlert
					v-if="error"
					color="error"
					icon="i-heroicons-exclamation-triangle"
					:description="error"
				/>

				<!-- Response Output -->
				<UCard v-if="responseText" class="bg-gray-50">
					<pre class="whitespace-pre-wrap text-sm">{{ responseText }}</pre>
				</UCard>

				<!-- Image Output -->
				<UCard v-if="generatedImageUrl" class="bg-white">
					<img :src="generatedImageUrl" alt="Generated image" class="max-w-full" />
				</UCard>

				<!-- TTS Audio Output -->
				<UCard v-if="ttsAudioUrl" class="bg-white">
					<audio :src="ttsAudioUrl" controls></audio>
				</UCard>

				<!-- Run Output -->
				<div v-if="outputRunPrompt?.runs?.length" class="grid gap-3">
					<UCard v-for="run in outputRunPrompt.runs" :key="run.temperature">
						<div class="text-sm mb-2">Temperature: {{ run.temperature.toFixed(2) }}</div>
						<div class="grid gap-2">
							<UCard v-for="c in run.choices" :key="c.index" class="bg-white">
								<div class="text-xs text-gray-500 mb-1">Sample {{ c.index + 1 }}</div>
								<div class="flex items-start justify-between gap-2">
									<div class="text-sm whitespace-pre-wrap">{{ c.text }}</div>
									<UButton
										size="xs"
										color="neutral"
										variant="soft"
										icon="i-heroicons-clipboard"
										@click="copyText(c.text)"
										>Copy</UButton
									>
								</div>
							</UCard>
						</div>
						<!-- Run Latency and Tokens -->
						<div class="mt-3 text-xs text-gray-600">
							Latency: {{ run.durationMs }} ms • Tokens: Prompt
							{{ run?.usage?.prompt_tokens ?? 0 }} • Completion
							{{ run?.usage?.completion_tokens ?? 0 }} • Total
							{{
								run?.usage?.total_tokens ??
								(run?.usage?.prompt_tokens ?? 0) + (run?.usage?.completion_tokens ?? 0)
							}}
						</div>
					</UCard>
				</div>
			</div>
		</UCard>

		<!-- History -->
		<div class="mt-6">
			<div class="flex items-center justify-between mb-1">
				<strong>Prompt History</strong>
				<UButton
					size="xs"
					color="neutral"
					variant="soft"
					icon="i-heroicons-arrow-path"
					@click="handleLoadAllHistory()"
					>Reload All History</UButton
				>
			</div>
			<div class="grid gap-3">
				<div v-if="history.length > 0" class="space-y-3 mt-2">
					<UCard v-for="item in history" :key="item.at">
						<!-- History Item Header -->
						<div class="flex items-center justify-between text-sm mb-2">
							<span>
								Model: {{ item.model }} • Temps:
								{{ item.temperatures.map((t) => t.toFixed(2)).join(', ') }} • Samples:
								{{ item.samples }}
							</span>
							<span>{{ new Date(item.at).toLocaleString() }}</span>
						</div>
						<!-- History Item Prompt -->
						<div class="mb-3">
							<strong>Prompt</strong>
							<div class="text-sm whitespace-pre-wrap">{{ item.prompt }}</div>
						</div>
						<!-- History Item Run Output -->
						<div v-if="item.runs?.length" class="grid gap-3">
							<UCard v-for="run in item.runs" :key="run.temperature" class="bg-white">
								<div class="text-xs text-gray-600 mb-2">
									Temperature: {{ run.temperature.toFixed(2) }} • Latency: {{ run.durationMs }} ms
								</div>
								<div class="grid gap-2">
									<div v-for="c in run.choices" :key="c.index">
										<div class="text-xs text-gray-500 mb-1">Sample {{ c.index + 1 }}</div>
										<div class="flex items-start justify-between gap-2">
											<div class="text-sm whitespace-pre-wrap">{{ c.text }}</div>
											<UButton
												size="xs"
												color="neutral"
												variant="soft"
												icon="i-heroicons-clipboard"
												@click="copyText(c.text)"
												>Copy</UButton
											>
										</div>
									</div>
								</div>
								<!-- History Item Run Latency and Tokens -->
								<div class="mt-2 text-xs text-gray-600">
									Tokens: Prompt {{ run?.usage?.prompt_tokens ?? 0 }} • Completion
									{{ run?.usage?.completion_tokens ?? 0 }} • Total
									{{
										run?.usage?.total_tokens ??
										(run?.usage?.prompt_tokens ?? 0) + (run?.usage?.completion_tokens ?? 0)
									}}
								</div>
							</UCard>
						</div>
					</UCard>
				</div>
				<div v-else>
					<p class="text-sm text-gray-500">No history available.</p>
				</div>
			</div>
		</div>

		<!-- Vision History -->
		<div class="mt-6">
			<div class="flex items-center justify-between mb-1">
				<strong>Vision History</strong>
			</div>
			<div class="grid gap-3">
				<div v-if="visionHistory.length > 0" class="space-y-3 mt-2">
					<UCard v-for="item in visionHistory" :key="item.at">
						<div class="flex items-center justify-between text-sm mb-2">
							<span>Model: {{ item.model }}</span>
							<span>{{ new Date(item.at).toLocaleString() }}</span>
						</div>
						<div v-if="item.prompt" class="mb-2">
							<strong>Prompt</strong>
							<div class="text-sm whitespace-pre-wrap">{{ item.prompt }}</div>
						</div>
						<div v-if="item.imageUrl" class="mb-2">
							<strong>Image</strong>
							<div class="text-xs text-gray-600">{{ item.imageUrl }}</div>
						</div>
						<div>
							<strong>Description</strong>
							<div class="text-sm whitespace-pre-wrap">{{ item.text }}</div>
						</div>
					</UCard>
				</div>
				<div v-else>
					<p class="text-sm text-gray-500">No vision history available.</p>
				</div>
			</div>
		</div>

		<!-- Transcription History -->
		<div class="mt-6">
			<div class="flex items-center justify-between mb-1">
				<strong>Transcription History</strong>
			</div>
			<div class="grid gap-3">
				<div v-if="transcriptionHistory.length > 0" class="space-y-3 mt-2">
					<UCard v-for="item in transcriptionHistory" :key="item.at">
						<div class="flex items-center justify-between text-sm mb-2">
							<span>Model: {{ item.model }}</span>
							<span>{{ new Date(item.at).toLocaleString() }}</span>
						</div>
						<div>
							<strong>Text</strong>
							<div class="text-sm whitespace-pre-wrap">{{ item.text }}</div>
						</div>
					</UCard>
				</div>
				<div v-else>
					<p class="text-sm text-gray-500">No transcriptions yet.</p>
				</div>
			</div>
		</div>

		<!-- TTS History -->
		<div class="mt-6">
			<div class="flex items-center justify-between mb-1">
				<strong>TTS History</strong>
			</div>
			<div class="grid gap-3">
				<div v-if="ttsHistory.length > 0" class="space-y-3 mt-2">
					<UCard v-for="item in ttsHistory" :key="item.at">
						<div class="flex items-center justify-between text-sm mb-2">
							<span>Model: {{ item.model }} • Voice: {{ item.voice || 'default' }}</span>
							<span>{{ new Date(item.at).toLocaleString() }}</span>
						</div>
						<div>
							<strong>Text</strong>
							<div class="text-sm whitespace-pre-wrap">{{ item.text }}</div>
						</div>
						<div class="text-xs text-gray-500 mt-1">Audio not persisted.</div>
					</UCard>
				</div>
				<div v-else>
					<p class="text-sm text-gray-500">No TTS items yet.</p>
				</div>
			</div>
		</div>

		<!-- Image Generation History -->
		<div class="mt-6">
			<div class="flex items-center justify-between mb-1">
				<strong>Image Generation History</strong>
			</div>
			<div class="grid gap-3">
				<div v-if="imageGenHistory.length > 0" class="space-y-3 mt-2">
					<UCard v-for="item in imageGenHistory" :key="item.at">
						<div class="flex items-center justify-between text-sm mb-2">
							<span>Model: {{ item.model }} • Size: {{ item.size || 'default' }}</span>
							<span>{{ new Date(item.at).toLocaleString() }}</span>
						</div>
						<div>
							<strong>Prompt</strong>
							<div class="text-sm whitespace-pre-wrap">{{ item.prompt }}</div>
						</div>
						<div class="text-xs text-gray-500 mt-1">Preview not persisted.</div>
					</UCard>
				</div>
				<div v-else>
					<p class="text-sm text-gray-500">No image generations yet.</p>
				</div>
			</div>
		</div>
	</UContainer>
</template>
