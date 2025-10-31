<script setup lang="ts">
const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

const models = [
	{ label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
	{ label: 'gpt-4o', value: 'gpt-4o' },
]

const prompt = ref('Explain what temperature does in LLMs, briefly.')
// Ensure a safe default without relying on array indexing
const model = ref<string>('gpt-4o-mini')
const temperature = ref(0.3)
const maxTokens = ref(200)
const loading = ref(false)
const error = ref<string | null>(null)
const responseText = ref('')
const history = ref<
	Array<{ prompt: string; response: string; temperature: number; model: string; at: number }>
>([])

const { $db } = useNuxtApp() as any

async function saveRecord(entry: {
	prompt: string
	response: string
	temperature: number
	model: string
}) {
	try {
		if (!$db) return
		const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
		await addDoc(collection($db, 'playground'), {
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
			},
		})
		responseText.value = (res as any)?.text || ''
		const entry = {
			prompt: prompt.value,
			response: responseText.value,
			temperature: temperature.value,
			model: model.value,
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
</script>

<template>
	<UContainer class="py-8">
		<h1 class="text-2xl font-semibold mb-6">Prompt Playground</h1>

		<UCard>
			<div class="grid gap-4">
				<UTextarea v-model="prompt" :rows="6" placeholder="Write your prompt here" />

				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
					<USelect v-model="model" :items="models" label="Model" />
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
			</div>
		</UCard>

		<h2 class="text-xl font-semibold mt-8 mb-4">History</h2>
		<div class="grid gap-4">
			<div v-if="history.length > 0">
				<UCard v-for="item in history" :key="item.at">
					<div class="flex items-center justify-between text-sm mb-2">
						<span>Temp: {{ item.temperature.toFixed(2) }} • Model: {{ item.model }}</span>
						<span>{{ new Date(item.at).toLocaleString() }}</span>
					</div>
					<div class="mb-2">
						<strong>Prompt</strong>
						<div class="text-sm whitespace-pre-wrap">{{ item.prompt }}</div>
					</div>
					<div>
						<strong>Response</strong>
						<div class="text-sm whitespace-pre-wrap">{{ item.response }}</div>
					</div>
				</UCard>
			</div>
			<div v-else>
				<p class="text-sm text-gray-500">No history available.</p>
			</div>
		</div>
	</UContainer>
</template>
