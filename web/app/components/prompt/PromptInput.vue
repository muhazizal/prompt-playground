<script setup lang="ts">
/**
 * PromptInput
 * Controlled input component for entering the prompt text.
 */
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function update(value: string) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="flex flex-col w-full">
    <span class="text-sm font-semibold">Prompt Input</span>
    <div class="text-xs text-gray-600 mb-2 mt-1">Enter your prompt here.</div>
    <UTextarea :model-value="props.modelValue" :rows="6" placeholder="Write your prompt here" @update:model-value="update" />
  </div>
</template>

