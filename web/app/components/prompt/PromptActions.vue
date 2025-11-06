<script setup lang="ts">
/**
 * PromptActions
 * Action buttons to run and clear output.
 */
const props = defineProps<{ loading?: boolean; disabledRun?: boolean }>()
const emit = defineEmits<{ (e: 'run'): void; (e: 'clear'): void }>()
</script>

<template>
	<div class="flex items-center gap-3 h-full">
		<UButton
			class="h-full"
			:loading="props.loading"
			:disabled="props.disabledRun || props.loading"
			color="primary"
			icon="i-heroicons-play"
			@click="emit('run')"
		>
			Run Prompt
		</UButton>
		<UButton
			class="h-full"
			variant="soft"
			color="neutral"
			:disabled="props.loading"
			icon="i-heroicons-trash"
			@click="emit('clear')"
			>Clear Output</UButton
		>
	</div>
</template>
