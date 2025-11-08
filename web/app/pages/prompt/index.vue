<script setup lang="ts">
import { onMounted } from 'vue'

import { handleFileReader, parseContext } from '@/helpers/functions'
import type { RunResult, HistoryEntry, TaskOption } from '@/helpers/types'
import { usePromptApi } from '@/composables/usePromptApi'
import { usePromptStream } from '@/composables/usePromptStream'
import { usePromptSave } from '~/composables/usePromptSave'
import PromptHeader from '@/components/prompt/PromptHeader.vue'
import PromptInput from '@/components/prompt/PromptInput.vue'
import PromptTaskPanel from '@/components/prompt/PromptTaskPanel.vue'
import TextContextPanel from '@/components/prompt/TextContextPanel.vue'
import VisionInputs from '@/components/prompt/VisionInputs.vue'
import STTInputs from '@/components/prompt/STTInputs.vue'
import TTSInputs from '@/components/prompt/TTSInputs.vue'
import ImageGenInputs from '@/components/prompt/ImageGenInputs.vue'
import PromptActions from '@/components/prompt/PromptActions.vue'
import PromptResultPanel from '@/components/prompt/PromptResultPanel.vue'

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
const useStreaming = ref(false)

// Context & Memory controls (chat)
const useMemory = ref(true)
const sessionId = ref('chat')
const memorySize = ref(30)
const contextBudgetTokens = ref<number | null>(null)
const summarizeOverflow = ref(true)
const summaryMaxTokens = ref(200)
const resetMemory = ref(false)
const contextJson = ref<string>('')

// Init helpers and auth
const nuxt = useNuxtApp()
const auth = (nuxt as any).$auth as any
const userId = computed<string | null>(() => (auth?.currentUser?.uid as string) || null)
const { chat, vision, speechToText, textToSpeech, imageGeneration, models } = usePromptApi()
const { streamOnce } = usePromptStream()
const { saveText, saveVision, saveTranscription, saveTTS, saveImageGen } = usePromptSave()

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

					// Context & Memory wiring
					const sid = userId.value ? `${userId.value}:${sessionId.value}` : sessionId.value
					const parsedCtx = parseContext(contextJson.value)
					Object.assign(body, {
						useMemory: useMemory.value,
						sessionId: sid,
						reset: resetMemory.value,
						memorySize: memorySize.value,
						summarizeOverflow: summarizeOverflow.value,
						summaryMaxTokens: summaryMaxTokens.value,
					})
					if (parsedCtx) body.context = parsedCtx
					if (contextBudgetTokens.value) body.contextBudgetTokens = contextBudgetTokens.value

					// Run the prompt via composable
					const data = await chat({
						prompt: prompt.value,
						model: model.value.value,
						maxTokens: maxTokens.value,
						n: samples.value,
						temperatures: temperatureSelection.value.length
							? temperatureSelection.value.map((t) => t.value)
							: [0.5],
						context: parsedCtx || undefined,
						useMemory: useMemory.value,
						sessionId: sid,
						reset: resetMemory.value,
						memorySize: memorySize.value,
						summarizeOverflow: summarizeOverflow.value,
						summaryMaxTokens: summaryMaxTokens.value,
						contextBudgetTokens: contextBudgetTokens.value ?? null,
						headers: userId.value ? { 'x-user-id': userId.value } : undefined,
					})

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
					await saveText(entry)
				} else {
					await streamPrompt()
				}
				break
			}
			case 'image-vision': {
				// Run the image vision prompt
				const data = await vision({
					imageUrl: imageUrl.value || undefined,
					imageBase64: imageBase64.value || undefined,
					prompt: prompt.value || 'Describe the image.',
					model: model.value.value,
					maxTokens: maxTokens.value,
				})
				responseText.value = data?.text || ''
				// Save history (avoid large binaries; only store imageUrl if present)
				await saveVision({
					...(prompt.value ? { prompt: prompt.value } : {}),
					...(imageUrl.value ? { imageUrl: imageUrl.value } : {}),
					text: data?.text || '',
					model: model.value.value,
					usage: data?.usage,
					durationMs: data?.durationMs,
				})
				break
			}
			case 'speech-to-text': {
				// Run the speech-to-text prompt
				const data = await speechToText({
					audioBase64: audioBase64.value,
					model: model.value.value,
				})
				responseText.value = data?.text || ''
				await saveTranscription({
					text: data?.text || '',
					model: data?.model || model.value.value,
					durationMs: data?.durationMs,
				})
				break
			}
			case 'text-to-speech': {
				// Run the text-to-speech prompt
				const data = await textToSpeech({
					text: prompt.value,
					model: model.value.value,
					voice: ttsVoice.value,
					format: 'mp3',
				})

				// Process the response
				if (typeof data?.audioBase64 === 'string') {
					ttsAudioUrl.value = `data:${data?.contentType || 'audio/mpeg'};base64,${data.audioBase64}`
					responseText.value = 'Speech generated successfully.'
				} else {
					responseText.value = 'Failed to generate speech.'
				}
				await saveTTS({
					text: prompt.value,
					voice: ttsVoice.value,
					model: data?.model || model.value.value,
					durationMs: data?.durationMs,
				})
				break
			}
			case 'image-generation': {
				// Generate an image from prompt
				const data = await imageGeneration({
					prompt: prompt.value,
					model: model.value.value,
					size: imageSize.value,
					format: 'png',
				})
				const b64 = data?.imageBase64
				if (typeof b64 === 'string' && b64) {
					generatedImageUrl.value = `data:image/png;base64,${b64}`
					responseText.value = 'Image generated successfully.'
				} else {
					generatedImageUrl.value = ''
					responseText.value = 'Failed to generate image.'
				}
				await saveImageGen({
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

		prompt.value = ''
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
function streamOnceWrapper(temp: number) {
	const sid = userId.value ? `${userId.value}:${sessionId.value}` : sessionId.value
	return streamOnce(
		{
			baseURL: apiBase,
			prompt: prompt.value,
			model: model.value.value,
			temperature: temp,
			maxTokens: maxTokens.value,
			useMemory: useMemory.value,
			sessionId: sid,
			memorySize: memorySize.value,
			summarizeOverflow: summarizeOverflow.value,
			summaryMaxTokens: summaryMaxTokens.value,
			reset: resetMemory.value,
			contextBudgetTokens: contextBudgetTokens.value ?? null,
			contextJson: contextJson.value?.trim() ? contextJson.value : null,
		},
		{
			onOpen: (t) => {
				responseText.value = `T=${t.toFixed(2)}: `
			},
			onSummary: (chunk) => {
				// Append streamed chunk to the response text in real-time
				responseText.value += chunk
			},
			onResult: (text) => {
				responseText.value = `T=${temp.toFixed(2)}: ` + text
			},
			onError: (msg) => {
				error.value = msg
			},
		}
	)
}

// Stream across multiple temperatures sequentially and save a single history entry
async function streamPrompt() {
	const temps = temperatureSelection.value.length
		? temperatureSelection.value.map((t) => t.value)
		: [0.5]

	const runs: RunResult[] = []
	for (const temp of temps) {
		try {
			const run = await streamOnceWrapper(temp)
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
	await saveText(entry)
}

// Load available models from API
async function handleLoadModel() {
	loadingModels.value = true
	try {
		const res = await models()
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

// Save helpers moved to useHistorySave composable

onMounted(async () => {
	await handleLoadModel()
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

watch(
	() => useStreaming.value,
	(streaming) => {
		if (streaming) {
			samples.value = 1
		}
	}
)
</script>

<template>
	<UContainer class="py-8">
		<PromptHeader />

		<UCard>
			<div class="grid gap-8">
				<PromptInput v-model="prompt" />

				<PromptTaskPanel
					v-model:selectedTask="selectedTask"
					v-model:temperatureSelection="temperatureSelection"
					v-model:samples="samples"
					v-model:maxTokens="maxTokens"
					:use-streaming="useStreaming"
					:task-options="taskOptions"
					:loading-models="loadingModels"
				/>

				<TextContextPanel
					v-if="selectedTask.task === 'text-generation'"
					v-model:useMemory="useMemory"
					v-model:sessionId="sessionId"
					v-model:memorySize="memorySize"
					v-model:contextBudgetTokens="contextBudgetTokens"
					v-model:summarizeOverflow="summarizeOverflow"
					v-model:summaryMaxTokens="summaryMaxTokens"
					v-model:resetMemory="resetMemory"
					v-model:contextJson="contextJson"
				/>

				<ImageGenInputs
					v-if="selectedTask.task === 'image-generation'"
					:imageSizeOptions="imageSizeOptions"
					v-model:imageSize="imageSize"
				/>

				<VisionInputs
					v-if="selectedTask.task === 'image-vision'"
					v-model:imageUrl="imageUrl"
					@changeImage="handleChangeImage"
				/>

				<STTInputs v-if="selectedTask.task === 'speech-to-text'" @changeAudio="handleChangeAudio" />

				<TTSInputs v-if="selectedTask.task === 'text-to-speech'" v-model:ttsVoice="ttsVoice" />

				<div class="flex gap-3 items-center justify-end">
					<USwitch
						v-if="selectedTask.task === 'text-generation'"
						v-model="useStreaming"
						checked-icon="i-heroicons-wifi"
						unchecked-icon="i-heroicons-no-symbol"
						label="Stream Prompt"
						description="Real-time result"
					/>
					<PromptActions
						:loading="loading"
						:disabledRun="!prompt.trim()"
						@run="runPrompt"
						@clear="handleClearOutput"
					/>
				</div>

				<PromptResultPanel
					:responseText="responseText"
					:outputRun="outputRunPrompt"
					:generatedImageUrl="generatedImageUrl"
					:ttsAudioUrl="ttsAudioUrl"
					:error="error"
					@copy="copyText"
				/>
			</div>
		</UCard>
	</UContainer>
</template>
