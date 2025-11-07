<script setup lang="ts">
/**
 * STTInputs
 * Audio upload for speech-to-text tasks.
 */
const emit = defineEmits<{ (e: 'changeAudio', ev: Event): void }>()
</script>

<template>
	<div class="grid gap-3">
		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Upload Audio</label>
			<UInput type="file" accept="audio/*" @change="(e) => emit('changeAudio', e)" />
		</div>
	</div>
</template>
