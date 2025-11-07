<script setup lang="ts">
import AgentForm from '@/components/agent/AgentForm.vue'
import AgentResult from '@/components/agent/AgentResult.vue'
import type { AgentRunRequest } from '@/helpers/types'

const { runAgent, error, loading, result } = useAgent()

function onClear() {
	error.value = null
	result.value = null
}

async function onRun(payload: AgentRunRequest) {
	await runAgent(payload)
}
</script>

<template>
	<UContainer class="py-8">
		<div class="mb-6">
			<h1 class="text-2xl font-semibold">Mini Agent</h1>
			<p class="text-gray-600 text-sm">
				Chat, ask weather and semantic local docs retrieval with structured output.
			</p>
		</div>

		<div class="grid gap-6">
			<AgentForm :loading="loading" @submit="onRun" @clear="onClear" />

			<AgentResult :result="result" :error="error" :loading="loading" />
		</div>
	</UContainer>
</template>
