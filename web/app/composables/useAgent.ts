// Composable to run the mini agent via API
// Provides loading/error/result state and a typed runAgent function.
import type { AgentRunRequest, AgentRunResult } from '@/helpers/types'

export function useAgent() {
	const config = useRuntimeConfig()
	const loading = ref(false)
	const error = ref<string | null>(null)
	const result = ref<AgentRunResult | null>(null)

	async function runAgent(payload: AgentRunRequest): Promise<AgentRunResult> {
		loading.value = true
		error.value = null
		result.value = null
		try {
			const res = await $fetch<AgentRunResult>('/agent/run', {
				baseURL: config.public.apiBase,
				method: 'POST',
				body: payload,
				headers: { 'Content-Type': 'application/json' },
			})
			result.value = res
			return res
		} catch (e: any) {
			error.value = e?.data?.message || e?.message || 'Request failed'
			throw e
		} finally {
			loading.value = false
		}
	}

	return { loading, error, result, runAgent }
}
