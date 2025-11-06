<script setup lang="ts">
import AgentForm from '@/components/agent/AgentForm.vue'
import AgentResult from '@/components/agent/AgentResult.vue'
import type { AgentRunRequest } from '@/helpers/types'

const { loading, error, result, runAgent } = useAgent()

async function onRun(payload: AgentRunRequest) {
	await runAgent(payload)
}
</script>

<template>
	<UContainer class="py-8">
		<div class="mb-6">
			<h1 class="text-2xl font-semibold">Mini Agent</h1>
			<p class="text-gray-700 text-sm">
				Chat, weather, and semantic docs retrieval with structured output.
			</p>
		</div>

		<div class="grid gap-6">
			<AgentForm :loading="loading" @submit="onRun" />

			<AgentResult :result="result" :error="error" :loading="loading" />
		</div>
	</UContainer>
</template>
