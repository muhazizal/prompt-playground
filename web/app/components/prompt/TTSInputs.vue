<script setup lang="ts">
/**
 * TTSInputs
 * Voice selection input for text-to-speech tasks.
 */
const props = defineProps<{ ttsVoice: string }>()
const emit = defineEmits<{ (e: 'update:ttsVoice', v: string): void }>()
</script>

<template>
	<div class="grid gap-3">
		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Voice</label>
			<UInput
				:model-value="props.ttsVoice"
				placeholder="alloy"
				@update:model-value="(v) => emit('update:ttsVoice', v as string)"
			/>
		</div>
	</div>
</template>
