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
      <span class="text-sm font-semibold">Upload Audio</span>
      <div class="text-xs text-gray-600 mb-2 mt-1">Upload an audio file to use with the prompt.</div>
      <UInput type="file" accept="audio/*" @change="(e) => emit('changeAudio', e)" />
    </div>
  </div>
</template>

