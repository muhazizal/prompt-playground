<script setup lang="ts">
import type { AgentRunResult, AgentSource } from '@/helpers/types'

const props = defineProps<{
	result: AgentRunResult | null
	error: string | null
	loading: boolean
}>()

function fmtCurrency(n?: number) {
	if (n == null) return '-'
	return `$${n.toFixed(4)}`
}

function fmtMs(n?: number) {
	if (n == null) return '-'
	return `${Math.round(n)} ms`
}

// Safely display total tokens regardless of backend key style
const tokensDisplay = computed(() => {
	const u: any = props.result?.usage as any
	if (!u) return '-'
	const v = u.totalTokens ?? u.total_tokens
	return v == null ? '-' : String(v)
})

// Normalize sources to structured objects
const sourcesNormalized = computed<AgentSource[]>(() => {
	const raw: any[] = (props.result?.sources as any[]) || []
	return raw.map((s: any) => {
		if (typeof s === 'string') return { type: 'doc', file: s }
		return s as AgentSource
	})
})
</script>

<template>
	<div class="grid gap-4">
		<UAlert v-if="error" color="error" :title="'Error'" :description="error" />

		<UCard v-if="loading">
			<div class="space-y-2">
				<USkeleton class="h-6 w-2/3" />
				<USkeleton class="h-6 w-1/2" />
				<USkeleton class="h-24 w-full" />
			</div>
		</UCard>

		<UCard v-if="result && !loading">
			<div class="space-y-6">
				<div>
					<div>
						<strong>Answer</strong>
						<div class="text-sm whitespace-pre-wrap">{{ result.answer }}</div>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
						<UCard>
							<div>
								<strong class="text-sm text-gray-600">Cost</strong>
								<div class="text-sm">{{ fmtCurrency(result.costUsd) }}</div>
							</div>
						</UCard>
						<UCard>
							<div>
								<strong class="text-sm text-gray-600">Duration</strong>
								<div class="text-sm">{{ fmtMs(result.durationMs) }}</div>
							</div>
						</UCard>
						<UCard>
							<div>
								<strong class="text-sm text-gray-600">Tokens</strong>
								<div class="text-sm">
									{{ tokensDisplay }}
								</div>
							</div>
						</UCard>
					</div>
				</div>

				<hr class="text-gray-200" />

				<div v-if="sourcesNormalized.length">
					<strong>Sources</strong>
					<ul class="text-sm text-gray-700 space-y-2">
						<li
							v-for="s in sourcesNormalized"
							:key="(s.file || s.url || s.title || s.type) + (s.score ?? '')"
						>
							<UBadge size="xs" :label="s.type.toUpperCase()" class="mr-2" />
							<span v-if="s.title">{{ s.title }}</span>
							<span v-if="s.file">{{ s.file }}</span>
							<span v-if="s.url">
								· <a :href="s.url" class="text-primary-600" target="_blank">link</a></span
							>
							<div v-if="s.snippet" class="mt-1 text-gray-600">{{ s.snippet }}</div>
						</li>
					</ul>
				</div>

				<hr class="text-gray-200" />

				<div v-if="result.steps?.length">
					<strong>Steps</strong>
					<div class="space-y-2">
						<div v-for="st in result.steps" :key="st.name + (st.startedAt ?? '')">
							<div v-if="typeof st === 'string'">
								<UBadge size="sm" :label="st" class="mr-2" variant="subtle" />
							</div>
							<UCard v-else>
								<div class="flex items-center justify-between">
									<div>
										<div class="text-sm font-medium">{{ st.name }}</div>
										<div class="text-xs text-gray-600">{{ st.type || 'step' }}</div>
									</div>
									<div class="text-xs text-gray-600">{{ fmtMs(st.durationMs) }}</div>
								</div>
							</UCard>
						</div>
					</div>
				</div>

				<details v-if="result.debug" class="mt-2">
					<summary class="cursor-pointer text-sm text-gray-700">Debug</summary>
					<pre class="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto">{{ result.debug }}</pre>
				</details>
			</div>
		</UCard>
	</div>
</template>
