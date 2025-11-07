<script setup lang="ts">
import AgentForm from '@/components/agent/AgentForm.vue'
import AgentResult from '@/components/agent/AgentResult.vue'
import type { AgentRunRequest } from '@/helpers/types'

const { loading, error, result, runAgent } = useAgent()
const { runAgentStream } = useAgentStream()
const streamEnabled = ref(false)

function onClear() {
	error.value = null
	result.value = null
}

async function onRun(payload: AgentRunRequest) {
	if (!streamEnabled.value) {
		await runAgent(payload)
		return
	}

	// Run via SSE streaming
	const config = useRuntimeConfig()
	loading.value = true
	error.value = null
	result.value = { answer: '', sources: [] }
	await runAgentStream(
		{ ...payload, baseURL: config.public.apiBase },
		{
			onStep: (name) => {
				if (result.value) {
					const steps = Array.isArray(result.value.steps) ? result.value.steps : []
					steps.push({ name })
					;(result.value as any).steps = steps
				}
			},
			onSummary: (chunk) => {
				if (result.value && typeof chunk === 'string') {
					result.value.answer += chunk
				}
			},
			onResult: (res) => {
				result.value = res
			},
			onUsage: (u) => {
				if (result.value) result.value.usage = u
			},
			onError: (msg) => {
				error.value = msg
				loading.value = false
			},
			onEnd: () => {
				loading.value = false
			},
		}
	)
}
</script>

<template>
	<UContainer class="py-8">
		<div class="mb-6">
			<h1 class="text-2xl font-semibold">Mini Agent</h1>
			<p class="text-gray-600 text-sm">
				Chat, weather, and semantic docs retrieval with structured output.
			</p>
		</div>

		<div class="grid gap-6">
			<AgentForm
				:loading="loading"
				v-model:streamEnabled="streamEnabled"
				@submit="onRun"
				@clear="onClear"
			/>

			<AgentResult :result="result" :error="error" :loading="loading" />
		</div>
	</UContainer>
</template>
