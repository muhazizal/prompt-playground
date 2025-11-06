<script setup lang="ts">
/**
 * PromptHeader
 * Small header component to keep page headers consistent and reusable.
 */
const props = withDefaults(
  defineProps<{ title?: string; subtitle?: string; historyLink?: string }>(),
  { title: 'Prompt Playground', subtitle: 'Compare prompt outputs across temperatures and samples.', historyLink: '/prompt/history' }
)
</script>

<template>
  <div class="mb-6 flex justify-between items-center">
    <div>
      <h1 class="text-2xl font-semibold">{{ props.title }}</h1>
      <p class="text-sm text-grey-700">{{ props.subtitle }}</p>
    </div>
    <ULink :to="props.historyLink">
      <UButton color="primary" icon="i-heroicons-document-text">Open History</UButton>
    </ULink>
  </div>
</template>

