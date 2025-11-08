<script setup lang="ts">
/**
 * TTSInputs
 * Voice selection input for text-to-speech tasks.
 */
import { VOICE_OPTIONS } from '@/helpers/constants'

const props = defineProps<{ ttsVoice: string }>()
const emit = defineEmits<{ (e: 'update:ttsVoice', v: string): void }>()
</script>

<template>
	<div class="grid gap-3">
		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Voice</label>
			<USelectMenu
				:model-value="props.ttsVoice"
				:items="VOICE_OPTIONS"
				placeholder="Select voice"
				@update:model-value="(v) => emit('update:ttsVoice', v as string)"
			/>
		</div>
	</div>
</template>
