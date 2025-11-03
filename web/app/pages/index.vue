<script setup lang="ts">
import { Firestore } from 'firebase/firestore'
import { getDocs, addDoc, collection, serverTimestamp } from 'firebase/firestore'

import { temperatureOptions } from '@/helpers/constants'
import type { RunResult, HistoryEntry } from '@/helpers/types'

const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

const models = ref<Array<{ label: string; value: string }>>([])

const prompt = ref('Explain what temperature does in LLMs, briefly.')
const model = ref<{ label: string; value: string }>({ label: 'gpt-4o-mini', value: 'gpt-4o-mini' })
const maxTokens = ref(200)
const samples = ref(2)
const temperatureSelection = ref<Array<{ label: string; value: number }>>([
	{ label: '0.50', value: 0.5 },
])
const loading = ref(false)
const loadingModels = ref(false)
const error = ref<string | null>(null)
const responseText = ref('')

const outputRunPrompt = ref<HistoryEntry>()
const history = ref<HistoryEntry[]>([])

const nuxt = useNuxtApp()
const db = (nuxt as any).$db as Firestore | undefined

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

		await addDoc(collection(db, 'playground'), {
			...entry,
			createdAt: serverTimestamp(),
		})
		console.log('[save] success')
	} catch (e: any) {
		console.warn('[save] failed:', e?.message || e)
		return
	}
}

async function runPrompt() {
	loading.value = true
	error.value = null
	responseText.value = ''
	try {
		const body: any = {
			prompt: prompt.value,
			model: model.value.value,
			maxTokens: maxTokens.value,
			n: samples.value,
		}
		// Always send temperatures, default to 0.50 if none selected
		body.temperatures = temperatureSelection.value.length
			? temperatureSelection.value.map((t) => t.value)
			: [0.5]
		const res = await $fetch(`${apiBase}/chat`, {
			method: 'POST',
			body,
		})
		const data = res as any
		const runs: RunResult[] = Array.isArray(data?.runs) ? data.runs : []
		responseText.value = runs
			.flatMap((r) =>
				r.choices.map((c) => `T=${r.temperature.toFixed(2)} [${c.index + 1}]: ${c.text}`)
			)
			.join('\n\n')
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
		history.value.unshift(entry)
		await saveRecord(entry)
	} catch (e: any) {
		error.value = e?.data?.error || e?.message || 'Request failed'
	} finally {
		loading.value = false
	}
}

async function handleLoadModel() {
	loadingModels.value = true
	try {
		const res = await $fetch(`${apiBase}/models`)
		const list = (res as any)?.models
		if (Array.isArray(list) && list.length > 0) {
			models.value = list

			// If current model not in list, default to first.
			if (!list.find((m: any) => m.value === model.value.value)) {
				model.value = list[0]
			}
		}
	} catch {
	} finally {
		loadingModels.value = false
	}
}

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

		console.log('[load history]', list)
	} catch (e: any) {
		console.warn('[load history] failed:', e?.message || e)
	} finally {
		loading.value = false
	}
}

onMounted(async () => {
	await handleLoadModel()
	await handleLoadHistory()
})

function copyText(text: string) {
	try {
		navigator.clipboard?.writeText(text)
	} catch (e) {
		console.warn('Clipboard copy failed', e)
	}
}
</script>

<template>
	<UContainer class="py-8">
		<h1 class="text-2xl font-semibold mb-6">Prompt Playground</h1>

		<UCard>
			<div class="grid gap-6">
				<UTextarea v-model="prompt" :rows="6" placeholder="Write your prompt here" />

				<div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
					<!-- Models -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm">Model</span>
						</div>
						<USelectMenu
							v-model="model"
							:items="models"
							:disabled="loadingModels"
							:loading="loadingModels"
							class="w-full"
						/>
					</div>
					<!-- Temperatures -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm">Temperatures</span>
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
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm">Samples</span>
							<span class="text-sm">{{ samples }}</span>
						</div>
						<USlider v-model="samples" :min="1" :max="5" :step="1" />
					</div>
					<!-- Max Tokens -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm">Max Tokens</span>
							<span class="text-sm">{{ maxTokens }}</span>
						</div>
						<USlider v-model="maxTokens" :min="32" :max="1024" :step="16" />
					</div>
				</div>

				<div class="flex gap-2">
					<UButton :loading="loading" icon="i-heroicons-play" @click="runPrompt">Run</UButton>
					<UButton color="neutral" variant="soft" @click="responseText = ''">Clear Output</UButton>
				</div>

				<UAlert
					v-if="error"
					color="error"
					icon="i-heroicons-exclamation-triangle"
					:description="error"
				/>

				<UCard v-if="responseText" class="bg-gray-50">
					<pre class="whitespace-pre-wrap text-sm">{{ responseText }}</pre>
				</UCard>

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

		<h2 class="text-xl font-semibold mt-8 mb-4">History</h2>
		<div class="grid gap-4">
			<div v-if="history.length > 0" class="space-y-4">
				<UCard v-for="item in history" :key="item.at">
					<div class="flex items-center justify-between text-sm mb-2">
						<span>
							Model: {{ item.model }} • Temps:
							{{ item.temperatures.map((t) => t.toFixed(2)).join(', ') }} • Samples:
							{{ item.samples }}
						</span>
						<span>{{ new Date(item.at).toLocaleString() }}</span>
					</div>
					<div class="mb-3">
						<strong>Prompt</strong>
						<div class="text-sm whitespace-pre-wrap">{{ item.prompt }}</div>
					</div>
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
	</UContainer>
</template>
