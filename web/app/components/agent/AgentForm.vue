<script setup lang="ts">
import { removeNullOrUndefinedKeys } from '@/helpers/functions'
import type { AgentRunRequest } from '@/helpers/types'

// Props allow overriding defaults
const props = defineProps<{
	defaults?: Partial<AgentRunRequest>
	loading?: boolean
}>()
const emit = defineEmits<{
	(e: 'submit', payload: AgentRunRequest): void
	(e: 'clear'): void
}>()

const form = reactive({
	prompt: props.defaults?.prompt ?? '',
})

function onSubmit() {
	if (!form.prompt.trim()) return
	const payload: AgentRunRequest = {
		prompt: form.prompt.trim(),
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

			<div class="flex justify-end gap-3">
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
