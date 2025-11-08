<script setup lang="ts">
/**
 * PromptResultPanel
 * Displays aggregated response text, run outputs, and generated media.
 */
import type { HistoryEntry } from '@/helpers/types'
import PromptOutputList from '@/components/prompt/PromptOutputList.vue'

const props = defineProps<{
	responseText: string
	outputRun?: HistoryEntry
	generatedImageUrl?: string
	ttsAudioUrl?: string
	error?: string | null
}>()

const emit = defineEmits<{ (e: 'copy', value: string): void }>()
</script>

<template>
	<div class="grid gap-4">
		<div v-if="props.responseText" class="flex flex-col gap-2">
			<div class="flex items-center justify-between">
				<div class="text-sm font-semibold">Response</div>
				<UButton size="xs" icon="i-heroicons-clipboard" @click="emit('copy', props.responseText)"
					>Copy</UButton
				>
			</div>
			<UTextarea :model-value="props.responseText" :autoresize="true" readonly class="w-full" />
		</div>

		<div v-if="props.error" class="text-red-600 text-sm">{{ props.error }}</div>

		<div v-if="props.generatedImageUrl">
			<div class="text-sm font-semibold mb-2">Generated Image</div>
			<img :src="props.generatedImageUrl" alt="Generated image" class="rounded border" />
		</div>

		<div v-if="props.ttsAudioUrl">
			<div class="text-sm font-semibold mb-2">Generated Audio</div>
			<audio :src="props.ttsAudioUrl" controls />
		</div>

		<div v-if="props.outputRun?.runs?.length">
			<div class="text-sm font-semibold mb-2">Run Outputs</div>
			<PromptOutputList :runs="props.outputRun!.runs" @copy="(t) => emit('copy', t)" />
		</div>
	</div>
</template>
