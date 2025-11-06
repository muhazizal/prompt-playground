<script setup lang="ts">
/**
 * TextContextPanel
 * Context & memory controls for text-generation tasks.
 */
const props = defineProps<{
  useMemory: boolean
  sessionId: string
  memorySize: number
  contextBudgetTokens: number | null
  summarizeOverflow: boolean
  summaryMaxTokens: number
  resetMemory: boolean
  contextJson: string
}>()

const emit = defineEmits<{
  (e: 'update:useMemory', v: boolean): void
  (e: 'update:sessionId', v: string): void
  (e: 'update:memorySize', v: number): void
  (e: 'update:contextBudgetTokens', v: number | null): void
  (e: 'update:summarizeOverflow', v: boolean): void
  (e: 'update:summaryMaxTokens', v: number): void
  (e: 'update:resetMemory', v: boolean): void
  (e: 'update:contextJson', v: string): void
}>()
</script>

<template>
  <div class="grid gap-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Use Memory</span>
        </div>
        <div class="text-xs text-gray-600 mt-1 mb-2">Persist chat history for this session.</div>
        <USwitch :model-value="props.useMemory" label="Enable memory" @update:model-value="(v) => emit('update:useMemory', v as boolean)" />
      </div>
      <div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Session ID</span>
        </div>
        <div class="text-xs text-gray-600 mt-1 mb-2">Unique identifier for this session.</div>
        <UInput :model-value="props.sessionId" placeholder="chat" class="w-full" @update:model-value="(v) => emit('update:sessionId', v as string)" />
      </div>
      <div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Memory Size</span>
          <span class="text-sm">{{ props.memorySize }}</span>
        </div>
        <div class="text-xs text-gray-600 mt-1 mb-2">Number of messages to store in memory.</div>
        <USlider :model-value="props.memorySize" :min="1" :max="200" :step="1" @update:model-value="(v) => emit('update:memorySize', v as number)" />
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Context Budget Tokens</span>
        </div>
        <div class="text-xs text-gray-600 mt-1 mb-2">Maximum number of tokens to use for context.</div>
        <UInput :model-value="props.contextBudgetTokens" type="number" placeholder="auto" class="w-full" @update:model-value="(v) => emit('update:contextBudgetTokens', (v as any) ?? null)" />
      </div>
      <div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Overflow Summarization</span>
        </div>
        <div class="text-xs text-gray-600 mt-1 mb-2">Summarize overflow context if it exceeds the budget.</div>
        <USwitch :model-value="props.summarizeOverflow" label="Summarize overflow context" @update:model-value="(v) => emit('update:summarizeOverflow', v as boolean)" />
      </div>
      <div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">Summary Max Tokens</span>
          <span class="text-sm">{{ props.summaryMaxTokens }}</span>
        </div>
        <div class="text-xs text-gray-600 mt-1 mb-2">Maximum number of tokens to use for summary.</div>
        <USlider :model-value="props.summaryMaxTokens" :min="32" :max="400" :step="8" @update:model-value="(v) => emit('update:summaryMaxTokens', v as number)" />
      </div>
    </div>

    <div>
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">Reset Memory</span>
      </div>
      <div class="text-xs text-gray-600 mt-1 mb-2">Clear session on next run.</div>
      <USwitch :model-value="props.resetMemory" label="Enable reset memory" @update:model-value="(v) => emit('update:resetMemory', v as boolean)" />
    </div>

    <div class="flex flex-col w-full">
      <span class="text-sm font-semibold">Context JSON</span>
      <div class="text-xs text-gray-600 mb-2 mt-1">Optional. Example: { "project": "Acme", "audience": "engineers" }</div>
      <UTextarea :model-value="props.contextJson" :rows="4" placeholder='{"project":"Acme"}' @update:model-value="(v) => emit('update:contextJson', v as string)" />
    </div>
  </div>
</template>

