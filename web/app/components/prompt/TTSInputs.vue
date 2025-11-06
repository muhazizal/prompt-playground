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
      <span class="text-sm font-semibold">Voice</span>
      <div class="text-xs text-gray-600 mb-2 mt-1">Enter the voice to use with the prompt.</div>
      <UInput :model-value="props.ttsVoice" placeholder="alloy" @update:model-value="(v) => emit('update:ttsVoice', v as string)" />
    </div>
  </div>
</template>

