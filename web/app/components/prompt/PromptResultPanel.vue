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
	<div class="grid gap-6">
		<div class="flex items-center justify-between">
			<span class="text-sm font-semibold">Response</span>
			<UButton size="xs" icon="i-heroicons-clipboard" @click="emit('copy', props.responseText)"
				>Copy</UButton
			>
		</div>
		<UTextarea :model-value="props.responseText" :rows="8" readonly />

		<div v-if="props.error" class="text-red-600 text-sm">{{ props.error }}</div>

		<!-- Generated Media Previews -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div v-if="props.generatedImageUrl">
				<span class="text-sm font-semibold">Generated Image</span>
				<img :src="props.generatedImageUrl" alt="Generated image" class="rounded border" />
			</div>

			<div v-if="props.ttsAudioUrl">
				<span class="text-sm font-semibold">Generated Audio</span>
				<audio :src="props.ttsAudioUrl" controls />
			</div>
		</div>

		<!-- Run Outputs -->
		<div v-if="props.outputRun?.runs?.length">
			<span class="text-sm font-semibold">Run Outputs</span>
			<PromptOutputList :runs="props.outputRun!.runs" @copy="(t) => emit('copy', t)" />
		</div>
	</div>
</template>
