<script setup lang="ts">
import type { RunResult } from '@/helpers/types'

const props = defineProps<{ runs: RunResult[] | undefined }>()
const emit = defineEmits<{ (e: 'copy', text: string): void }>()

function handleCopy(text: string) {
  emit('copy', text)
}
</script>

<template>
  <div v-if="props.runs && props.runs.length" class="grid gap-3">
    <UCard v-for="run in props.runs" :key="run.temperature">
      <div class="text-sm mb-2">Temperature: {{ run.temperature.toFixed(2) }}</div>
      <div class="grid gap-2">
        <UCard v-for="c in run.choices" :key="c.index" class="bg-white">
          <div class="text-xs text-gray-500 mb-1">Sample {{ c.index + 1 }}</div>
          <div class="flex items-start justify-between gap-2">
            <div class="text-sm whitespace-pre-wrap">{{ c.text }}</div>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-heroicons-clipboard"
              @click="handleCopy(c.text)"
              >Copy</UButton
            >
          </div>
        </UCard>
      </div>
      <div class="mt-3 text-xs text-gray-600">
        Latency: {{ run.durationMs }} ms • Tokens: Prompt
        {{ run?.usage?.prompt_tokens ?? 0 }} • Completion
        {{ run?.usage?.completion_tokens ?? 0 }} • Total
        {{
          run?.usage?.total_tokens ??
          (run?.usage?.prompt_tokens ?? 0) + (run?.usage?.completion_tokens ?? 0)
        }}
      </div>
    </UCard>
  </div>
  <div v-else />
</template>

