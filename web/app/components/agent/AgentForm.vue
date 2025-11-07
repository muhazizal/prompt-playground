<script setup lang="ts">
import { temperatureOptions, modelOptions } from '@/helpers/constants'
import { removeNullOrUndefinedKeys } from '@/helpers/functions'
import type { AgentRunRequest } from '@/helpers/types'

// Props allow overriding defaults
const props = defineProps<{
	defaults?: Partial<AgentRunRequest>
	loading?: boolean
	streamEnabled?: boolean
}>()
const emit = defineEmits<{
	(e: 'submit', payload: AgentRunRequest): void
	(e: 'clear'): void
	(e: 'update:streamEnabled', value: boolean): void
}>()

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
		<div class="grid gap-8">
			<div class="flex flex-col w-full">
				<label class="text-sm font-semibold mb-2">Prompt Input</label>
				<UTextarea
					v-model="form.prompt"
					:rows="6"
					placeholder="Explain about AI agents"
					class="w-full"
				/>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<!-- Model -->
				<div class="flex flex-col w-full">
					<label class="text-sm font-semibold mb-2">Model</label>
					<USelect v-model="form.model" :items="modelOptions" class="w-full" disabled />
				</div>
				<!-- Temperature -->
				<div class="flex flex-col w-full">
					<div class="flex items-center justify-between mb-2">
						<label class="text-sm font-semibold">Temperatures</label>
						<span class="text-xs text-gray-500">{{ form.temperature }}</span>
					</div>
					<USelect v-model="form.temperature" :items="temperatureOptions" class="w-full" />
				</div>
				<!-- Max Tokens -->
				<div class="flex flex-col w-full">
					<label class="text-sm font-semibold mb-2">Max Tokens</label>
					<UInput
						v-model.number="form.maxTokens"
						type="number"
						min="64"
						max="4096"
						class="w-full"
					/>
				</div>
				<!-- Use Memory -->
				<div class="flex flex-col w-full">
					<label class="text-sm font-semibold mb-2">Use Memory</label>
					<USwitch v-model="form.useMemory" label="Enable memory" class="w-full" />
				</div>
				<!-- Chain Debug -->
				<div class="flex flex-col w-full">
					<label class="text-sm font-semibold mb-2">Chain Debug</label>
					<USwitch v-model="form.chainDebug" label="Enable chain debug" class="w-full" />
				</div>
				<!-- Session ID -->
				<div class="flex flex-col w-full">
					<label class="text-sm font-semibold mb-2">Session ID</label>
					<UInput v-model="form.sessionId" placeholder="mini-agent" class="w-full" />
				</div>
			</div>

			<div class="flex justify-end gap-3">
				<USwitch
					:model-value="streamEnabled"
					checked-icon="i-heroicons-wifi"
					unchecked-icon="i-heroicons-no-symbol"
					label="Stream Prompt"
					description="Real-time result"
					@update:model-value="(value) => emit('update:streamEnabled', value)"
				/>
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
				<UButton color="neutral" variant="soft" icon="i-heroicons-trash" @click="emit('clear')">
					Clear Output
				</UButton>
			</div>
		</div>
	</UCard>
</template>
