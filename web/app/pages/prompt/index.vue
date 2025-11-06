<script setup lang="ts">
import { onMounted } from 'vue'

import { temperatureOptions } from '@/helpers/constants'
import { handleFileReader } from '@/helpers/functions'
import type { RunResult, HistoryEntry, TaskOption } from '@/helpers/types'
import PromptOutputList from '~/components/prompt/PromptOutputList.vue'
import { usePromptApi } from '@/composables/usePromptApi'
import { usePromptStream } from '@/composables/usePromptStream'
import { useHistorySave } from '@/composables/useHistorySave'

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
const { saveText, saveVision, saveTranscription, saveTTS, saveImageGen } = useHistorySave()

function parseContext(text: string): any | null {
	if (!text || !text.trim()) return null
	try {
		const obj = JSON.parse(text)
		return obj && typeof obj === 'object' ? obj : null
	} catch {
		return null
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
</script>

<template>
	<UContainer class="py-8">
		<!-- Header -->
		<div class="mb-6 flex justify-between items-center">
			<div>
				<h1 class="text-2xl font-semibold">Prompt Playground</h1>
				<p class="text-sm text-grey-700">Compare prompt outputs across temperatures and samples.</p>
			</div>
			<ULink to="/prompt/history">
				<UButton color="primary" icon="i-heroicons-document-text">Open History</UButton>
			</ULink>
		</div>

		<UCard>
			<div class="grid gap-6">
				<!-- Prompt Input -->
				<div class="flex flex-col w-full">
					<span class="text-sm font-semibold">Prompt Input</span>
					<div class="text-xs text-gray-600 mb-2 mt-1">Enter your prompt here.</div>
					<UTextarea v-model="prompt" :rows="6" placeholder="Write your prompt here" />
				</div>

				<hr class="text-gray-300" />

				<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
					<!-- Models -->
					<div>
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold">Task</span>
							<span class="text-xs text-gray-500">{{ selectedTask.model }}</span>
						</div>
						<div class="text-xs text-gray-600 mt-1 mb-2">Select the task type.</div>
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
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold">Temperatures</span>
							<span class="text-xs text-gray-500">{{
								temperatureSelection.map((t) => t.label).join(', ') || 'None'
							}}</span>
						</div>
						<div class="text-xs text-gray-600 mt-1 mb-2">Select the temperature(s) to use.</div>
						<USelectMenu
							v-model="temperatureSelection"
							:items="temperatureOptions"
							multiple
							class="w-full"
						/>
					</div>
					<!-- Samples -->
					<div v-if="selectedTask.task === 'text-generation' && !useStreaming">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold">Samples</span>
							<span class="text-sm">{{ samples }}</span>
						</div>
						<div class="text-xs text-gray-600 mt-1 mb-2">
							Select the number of samples to generate.
						</div>
						<USlider v-model="samples" :min="1" :max="5" :step="1" />
					</div>
					<!-- Max Tokens (text & vision only) -->
					<div v-if="['text-generation', 'image-vision'].includes(selectedTask.task)">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold">Max Tokens</span>
							<span class="text-sm">{{ maxTokens }}</span>
						</div>
						<div class="text-xs text-gray-600 mt-1 mb-2">
							Set the max number of tokens to generate.
						</div>
						<USlider v-model="maxTokens" :min="32" :max="1024" :step="16" />
					</div>
				</div>

				<hr class="text-gray-300" />

				<!-- Task-specific inputs -->
				<div class="grid gap-4">
					<!-- Context & Memory (Text Generation only) -->
					<div v-if="selectedTask.task === 'text-generation'">
						<div class="grid gap-6">
							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<div class="flex items-center justify-between">
										<span class="text-sm font-semibold">Use Memory</span>
									</div>
									<div class="text-xs text-gray-600 mt-1 mb-2">
										Persist chat history for this session.
									</div>
									<USwitch v-model="useMemory" label="Enable memory" />
								</div>
								<div>
									<div class="flex items-center justify-between">
										<span class="text-sm font-semibold">Session ID</span>
									</div>
									<div class="text-xs text-gray-600 mt-1 mb-2">
										Unique identifier for this session.
									</div>
									<UInput v-model="sessionId" placeholder="chat" class="w-full" />
								</div>
								<div>
									<div class="flex items-center justify-between">
										<span class="text-sm font-semibold">Memory Size</span>
										<span class="text-sm">{{ memorySize }}</span>
									</div>
									<div class="text-xs text-gray-600 mt-1 mb-2">
										Number of messages to store in memory.
									</div>
									<USlider v-model="memorySize" :min="1" :max="200" :step="1" />
								</div>
							</div>

							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<div class="flex items-center justify-between">
										<span class="text-sm font-semibold">Context Budget Tokens</span>
									</div>
									<div class="text-xs text-gray-600 mt-1 mb-2">
										Maximum number of tokens to use for context.
									</div>
									<UInput
										v-model.number="contextBudgetTokens"
										type="number"
										placeholder="auto"
										class="w-full"
									/>
								</div>
								<div>
									<div class="flex items-center justify-between">
										<span class="text-sm font-semibold">Overflow Summarization</span>
									</div>
									<div class="text-xs text-gray-600 mt-1 mb-2">
										Summarize overflow context if it exceeds the budget.
									</div>
									<USwitch v-model="summarizeOverflow" label="Summarize overflow context" />
								</div>
								<div>
									<div class="flex items-center justify-between">
										<span class="text-sm font-semibold">Summary Max Tokens</span>
										<span class="text-sm">{{ summaryMaxTokens }}</span>
									</div>
									<div class="text-xs text-gray-600 mt-1 mb-2">
										Maximum number of tokens to use for summary.
									</div>
									<USlider v-model="summaryMaxTokens" :min="32" :max="400" :step="8" />
								</div>
							</div>

							<div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold">Reset Memory</span>
								</div>
								<div class="text-xs text-gray-600 mt-1 mb-2">Clear session on next run.</div>
								<USwitch v-model="resetMemory" label="Enable reset memory" />
							</div>

							<div class="flex flex-col w-full">
								<span class="text-sm font-semibold">Context JSON</span>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Optional. Example: { "project": "Acme", "audience": "engineers" }
								</div>
								<UTextarea
									v-model="contextJson"
									:rows="4"
									placeholder='{\n  "project": "Acme"\n}'
								/>
							</div>
						</div>
					</div>

					<div v-if="selectedTask.task === 'image-vision'">
						<div class="grid gap-6">
							<div class="flex flex-col w-full">
								<span class="text-sm font-semibold">Image URL</span>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Enter the URL of the image to use with the prompt.
								</div>
								<UInput v-model="imageUrl" placeholder="https://example.com/image.jpg" />
							</div>
							<div class="flex flex-col w-full">
								<span class="text-sm font-semibold">Or Upload Image</span>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Upload an image file to use with the prompt.
								</div>
								<UInput type="file" accept="image/*" @change="handleChangeImage" />
							</div>
						</div>
					</div>

					<div v-if="selectedTask.task === 'speech-to-text'">
						<div class="grid gap-3">
							<div class="flex flex-col w-full">
								<span class="text-sm font-semibold">Upload Audio</span>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Upload an audio file to use with the prompt.
								</div>
								<UInput type="file" accept="audio/*" @change="handleChangeAudio" />
							</div>
						</div>
					</div>

					<div v-if="selectedTask.task === 'text-to-speech'">
						<div class="grid gap-3">
							<div class="flex flex-col w-full">
								<span class="text-sm font-semibold">Voice</span>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Enter the voice to use with the prompt.
								</div>
								<UInput v-model="ttsVoice" placeholder="alloy" />
							</div>
						</div>
					</div>

					<div v-if="selectedTask.task === 'image-generation'">
						<div class="grid gap-3">
							<div class="flex flex-col w-full">
								<span class="text-sm font-semibold">Size</span>
								<div class="text-xs text-gray-600 mb-2 mt-1">Larger sizes may take longer.</div>
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
					<UButton
						class="h-full"
						icon="i-heroicons-play"
						:loading="loading"
						:disabled="!prompt.trim()"
						@click="runPrompt"
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
				<PromptOutputList :runs="outputRunPrompt?.runs" @copy="copyText" />
			</div>
		</UCard>
	</UContainer>
</template>
