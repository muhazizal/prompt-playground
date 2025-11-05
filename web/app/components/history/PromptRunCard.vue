<script setup lang="ts">
import type { HistoryEntry } from '@/helpers/types'

defineProps<{ entry: HistoryEntry }>()

function formatTemps(ts: number[]) {
	return ts?.map((t) => t.toFixed(2)).join(', ')
}
</script>

<template>
	<UCard class="bg-white">
		<div class="flex items-center justify-between text-sm mb-2">
			<span>Model: {{ entry.model }} • Temps: {{ formatTemps(entry.temperatures) }}</span>
			<span>
				{{
					(entry as any)?.createdAt?.toDate?.()
						? (entry as any).createdAt.toDate().toLocaleString()
						: entry.at
						? new Date(entry.at).toLocaleString()
						: ''
				}}
			</span>
		</div>
		<div class="grid gap-2">
			<div>
				<strong>Prompt</strong>
				<div class="text-sm whitespace-pre-wrap">{{ entry.prompt }}</div>
			</div>

			<div v-if="entry.runs && entry.runs.length" class="space-y-2">
				<div class="text-xs text-gray-600">
					Tokens: Prompt {{ entry.runs[0]?.usage?.prompt_tokens ?? 0 }} • Completion
					{{ entry.runs[0]?.usage?.completion_tokens ?? 0 }} • Total
					{{
						entry.runs[0]?.usage?.total_tokens ??
						(entry.runs[0]?.usage?.prompt_tokens ?? 0) +
							(entry.runs[0]?.usage?.completion_tokens ?? 0)
					}}
				</div>
				<div class="grid gap-2">
					<div v-for="run in entry.runs" :key="run.temperature" class="space-y-1">
						<div class="text-xs text-gray-500">
							Temperature: {{ run.temperature.toFixed(2) }} • Latency: {{ run.durationMs }} ms
						</div>
						<div v-for="c in run.choices" :key="c.index">
							<div class="text-xs text-gray-500 mb-1">Sample {{ c.index + 1 }}</div>
							<div class="text-sm whitespace-pre-wrap">{{ c.text }}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</UCard>
</template>
