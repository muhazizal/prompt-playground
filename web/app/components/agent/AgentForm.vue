<script setup lang="ts">
import { temperatureOptions, modelOptions } from '@/helpers/constants'
import { removeNullOrUndefinedKeys } from '@/helpers/functions'
import type { AgentRunRequest } from '@/helpers/types'

// Props allow overriding defaults
const props = defineProps<{ defaults?: Partial<AgentRunRequest>; loading?: boolean }>()
const emit = defineEmits<{ (e: 'submit', payload: AgentRunRequest): void }>()

const form = reactive({
	prompt: props.defaults?.prompt ?? '',
	useMemory: props.defaults?.useMemory ?? true,
	chainDebug: props.defaults?.chain === 'debug',
	model: props.defaults?.model ?? 'gpt-4o-mini',
	temperature: props.defaults?.temperature ?? 0.3,
	maxTokens: props.defaults?.maxTokens ?? 512,
	sessionId: props.defaults?.sessionId ?? 'mini-agent',
})

function onSubmit() {
	if (!form.prompt.trim()) return
	const payload: AgentRunRequest = {
		prompt: form.prompt.trim(),
		sessionId: form.sessionId,
		useMemory: !!form.useMemory,
		model: form.model,
		temperature: form.temperature,
		maxTokens: form.maxTokens,
		chain: form.chainDebug ? 'debug' : null,
	}
	emit('submit', removeNullOrUndefinedKeys(payload))
}
</script>

<template>
	<UCard>
		<div class="grid gap-6">
			<div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-semibold">Prompt Input</span>
				</div>
				<div class="text-xs text-gray-600 mb-2 mt-1">Enter your prompt here.</div>
				<UTextarea
					v-model="form.prompt"
					:rows="6"
					placeholder="Write your prompt here"
					class="w-full"
				/>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Model</span>
					</div>
					<div class="text-xs text-gray-600 mt-1 mb-2">Select the model to use.</div>
					<USelect v-model="form.model" :items="modelOptions" class="w-full" disabled />
				</div>
				<div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Temperatures</span>
						<span class="text-xs text-gray-500">{{ form.temperature }}</span>
					</div>
					<div class="text-xs text-gray-600 mt-1 mb-2">Select the temperature(s) to use.</div>
					<USelect v-model="form.temperature" :items="temperatureOptions" class="w-full" />
				</div>
				<div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Max Tokens</span>
					</div>
					<div class="text-xs text-gray-600 mt-1 mb-2">
						Set the max number of tokens to generate.
					</div>
					<UInput
						v-model.number="form.maxTokens"
						type="number"
						min="64"
						max="4096"
						class="w-full"
					/>
				</div>
				<div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Use Memory</span>
					</div>
					<div class="text-xs text-gray-600 mt-1 mb-2">Persist chat history for this session.</div>
					<USwitch v-model="form.useMemory" label="Enable memory" class="w-full" />
				</div>
				<div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Chain Debug</span>
					</div>
					<div class="text-xs text-gray-600 mt-1 mb-2">Enable debug mode for the chain.</div>
					<USwitch v-model="form.chainDebug" label="Enable chain debug" class="w-full" />
				</div>
				<div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Session ID</span>
					</div>
					<div class="text-xs text-gray-600 mt-1 mb-2">Unique identifier for this session.</div>
					<UInput v-model="form.sessionId" placeholder="mini-agent" class="w-full" />
				</div>
			</div>

			<div class="flex justify-end">
				<UButton
					class="h-full"
					color="primary"
					icon="i-heroicons-play"
					:loading="loading"
					:disabled="!form.prompt.trim()"
					@click="onSubmit"
				>
					Run Agent
				</UButton>
			</div>
		</div>
	</UCard>
</template>
