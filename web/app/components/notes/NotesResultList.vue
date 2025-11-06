<script setup lang="ts">
import type { NoteResult } from '@/helpers/types'
import { estimateCost } from '@/helpers/notes'

const props = defineProps<{ results: NoteResult[] }>()
const emit = defineEmits<{ (e: 'copy', text: string): void }>()

function copy(text: string) {
  emit('copy', text)
}
</script>

<template>
  <div v-if="props.results.length" class="grid gap-4">
    <UCard v-for="r in props.results" :key="r.file" class="bg-gray-50">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-semibold">{{ r.file }}</span>
        <UButton size="xs" color="neutral" variant="soft" icon="i-heroicons-clipboard" @click="copy(r.summary)">
          Copy Summary
        </UButton>
      </div>
      <div class="text-sm whitespace-pre-wrap">{{ r.summary }}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <UBadge v-for="t in r.tags" :key="t" color="primary" variant="soft">{{ t }}</UBadge>
      </div>
      <div v-if="r.evaluation" class="mt-2 text-xs text-gray-700">
        Coverage {{ (r.evaluation.coverage * 100).toFixed(0) }}% • Concision
        {{ (r.evaluation.concision * 100).toFixed(0) }}% • Formatting
        {{ ((r.evaluation.formatting ?? 0) * 100).toFixed(0) }}% • Factuality
        {{ ((r.evaluation.factuality ?? 0) * 100).toFixed(0) }}%
        <div v-if="r.evaluation.feedback" class="mt-1">{{ r.evaluation.feedback }}</div>
      </div>
      <div v-if="r.usage" class="mt-2 text-xs text-gray-600">
        Tokens: Prompt {{ r?.usage?.prompt_tokens ?? r?.usage?.promptTokens ?? 0 }} • Completion
        {{ r?.usage?.completion_tokens ?? r?.usage?.completionTokens ?? 0 }} • Total
        {{
          r?.usage?.total_tokens ?? r?.usage?.totalTokens ??
          (r?.usage?.prompt_tokens ?? r?.usage?.promptTokens ?? 0) + (r?.usage?.completion_tokens ?? r?.usage?.completionTokens ?? 0)
        }}
        <div class="my-1 flex items-center gap-2">
          <UBadge size="sm" color="neutral" variant="soft">
            Model {{ r.model ?? 'gpt-4o-mini' }}
          </UBadge>
          <UBadge v-if="estimateCost(r.usage, r.model) !== null" size="sm" color="primary" variant="soft">
            Cost est. ${{ estimateCost(r.usage, r.model) }}
          </UBadge>
        </div>
      </div>
    </UCard>
  </div>
</template>

