<script setup lang="ts">
const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

const models = ref<Array<{ label: string; value: string }>>([
	{ label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
	{ label: 'gpt-4o', value: 'gpt-4o' },
])

const prompt = ref('Explain what temperature does in LLMs, briefly.')
// Ensure a safe default without relying on array indexing
const model = ref<string>('gpt-4o-mini')
const temperature = ref(0.3)
const maxTokens = ref(200)
const samples = ref(1)
const loading = ref(false)
const loadingModels = ref(false)
const error = ref<string | null>(null)
const responseText = ref('')
type RunResult = {
	temperature: number
	choices: Array<{ index: number; text: string }>
	usage: any
	durationMs: number
}
const history = ref<
	Array<{
		prompt: string
		model: string
		temperature: number
		maxTokens: number
		samples: number
		runs: RunResult[]
		at: number
	}>
>([])

const nuxt = useNuxtApp()
const db = (nuxt as any).$db as import('firebase/firestore').Firestore | undefined

async function saveRecord(entry: {
	prompt: string
	model: string
	temperature: number
	maxTokens: number
	samples: number
	runs: RunResult[]
}) {
	try {
		if (!db) return
		const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
		await addDoc(collection(db, 'playground'), {
			...entry,
			createdAt: serverTimestamp(),
		})
	} catch (e: any) {
		console.warn('[save] failed:', e?.message || e)
	}
}

async function runPrompt() {
	loading.value = true
	error.value = null
	responseText.value = ''
	try {
		const res = await $fetch(`${apiBase}/chat`, {
			method: 'POST',
			body: {
				prompt: prompt.value,
				model: model.value,
				temperature: temperature.value,
				maxTokens: maxTokens.value,
				n: samples.value,
			},
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
			model: model.value,
			temperature: temperature.value,
			maxTokens: maxTokens.value,
			samples: samples.value,
			runs,
			at: Date.now(),
		}
		history.value.unshift(entry)
		await saveRecord(entry)
	} catch (e: any) {
		error.value = e?.data?.error || e?.message || 'Request failed'
	} finally {
		loading.value = false
	}
}

const tempPct = computed(() => Math.round(temperature.value * 100))

onMounted(async () => {
	loadingModels.value = true
	try {
		const res = await $fetch(`${apiBase}/models`)
		const list = (res as any)?.models
		if (Array.isArray(list) && list.length > 0) {
			models.value = list
			// If current model not in list, default to first.
			if (!list.find((m: any) => m.value === model.value)) {
				model.value = list[0].value
			}
		}
	} catch {
	} finally {
		loadingModels.value = false
	}
})
</script>

<template>
	<UContainer class="py-8">
		<h1 class="text-2xl font-semibold mb-6">Prompt Playground</h1>

		<UCard>
			<div class="grid gap-6">
				<UTextarea v-model="prompt" :rows="6" placeholder="Write your prompt here" />

				<div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
					<USelect
						v-model="model"
						:items="models"
						label="Model"
						:disabled="loadingModels"
						:loading="loadingModels"
					/>
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm">Temperature</span>
							<span class="text-sm">{{ temperature.toFixed(2) }}</span>
						</div>
						<USlider v-model="temperature" :min="0" :max="1" :step="0.05" />
						<div class="mt-2 h-2 bg-gray-200 rounded">
							<div class="h-full bg-pink-500 rounded" :style="{ width: tempPct + '%' }" />
						</div>
					</div>
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm">Max Tokens</span>
							<span class="text-sm">{{ maxTokens }}</span>
						</div>
						<USlider v-model="maxTokens" :min="32" :max="1024" :step="16" />
					</div>
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm">Samples</span>
							<span class="text-sm">{{ samples }}</span>
						</div>
						<USlider v-model="samples" :min="1" :max="5" :step="1" />
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

				<div v-if="history[0]?.runs?.length" class="grid gap-3">
					<UCard v-for="run in history[0].runs" :key="run.temperature">
						<div class="text-sm mb-2">Temperature: {{ run.temperature.toFixed(2) }}</div>
						<div class="grid gap-2">
							<UCard v-for="c in run.choices" :key="c.index" class="bg-white">
								<div class="text-xs text-gray-500 mb-1">Sample {{ c.index + 1 }}</div>
								<div class="text-sm whitespace-pre-wrap">{{ c.text }}</div>
							</UCard>
						</div>
						<div class="mt-3 text-xs text-gray-600">
							Latency: {{ run.durationMs }} ms • Usage: {{ JSON.stringify(run.usage) }}
						</div>
					</UCard>
				</div>
			</div>
		</UCard>

		<h2 class="text-xl font-semibold mt-8 mb-4">History</h2>
		<div class="grid gap-4">
			<div v-if="history.length > 0">
				<UCard v-for="item in history" :key="item.at">
					<div class="flex items-center justify-between text-sm mb-2">
						<span>
							Model: {{ item.model }} • Temp: {{ item.temperature.toFixed(2) }} • Samples:
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
								<div v-for="c in run.choices" :key="c.index" class="text-sm whitespace-pre-wrap">
									<span class="text-xs text-gray-500">Sample {{ c.index + 1 }}</span>
									<div>{{ c.text }}</div>
								</div>
							</div>
							<div class="mt-2 text-xs text-gray-600">Usage: {{ JSON.stringify(run.usage) }}</div>
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
