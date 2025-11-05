<script setup lang="ts">
import { onMounted } from 'vue'
import { Firestore } from 'firebase/firestore'
import { setDoc, doc, serverTimestamp } from 'firebase/firestore'
import type { NoteResult } from '@/helpers/types'

const toast = useToast()

// Runtime config
const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

// Init Firestore
const nuxt = useNuxtApp()
const db = (nuxt as any).$db as Firestore | undefined
const auth = (nuxt as any).$auth as any
const userId = computed<string | null>(() => (auth?.currentUser?.uid as string) || null)

function parseContext(text: string): any | null {
	if (!text || !text.trim()) return null
	try {
		const obj = JSON.parse(text)
		return obj && typeof obj === 'object' ? obj : null
	} catch {
		return null
	}
}

// Notes state
const files = ref<Array<{ name: string }>>([])
const selected = ref<string[]>([])
const results = ref<NoteResult[]>([])
const loadingList = ref(false)
const processing = ref(false)
const error = ref<string | null>(null)
const useStreaming = ref(false)

// Context & Memory controls (notes)
const useMemory = ref(true)
const sessionId = ref('notes')
const memorySize = ref(30)
const resetMemory = ref(false)
const contextJson = ref<string>('')
const contextBudgetTokens = ref<number | null>(null)
const summarizeOverflow = ref(true)
const summaryMaxTokens = ref(200)

// Tag configuration
const tagsConfig = ref<string[]>([])
const tagsLoading = ref(false)
const tagsSaving = ref(false)

// Simple price table (USD per 1M tokens) for cost estimation.
// Note: Values are estimates; verify against current vendor pricing.
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
	'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

function estimateCost(usage: any, model?: string | null) {
	if (!usage || !model) return null
	const price = PRICE_PER_MILLION[model]
	if (!price) return null
	const promptTokens = Number(usage?.prompt_tokens ?? 0)
	const completionTokens = Number(usage?.completion_tokens ?? 0)
	const cost =
		(promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output
	// Round to 4 decimal places for display
	return Math.round(cost * 10000) / 10000
}

// Load notes on mount
onMounted(async () => {
	await loadList()
	await loadTagsConfig()
})

// Load notes list
async function loadList(refresh = false) {
	loadingList.value = true
	error.value = null

	try {
		const res = await $fetch(`${apiBase}/notes/list`)
		const list = (res as any)?.files || []

		files.value = Array.isArray(list) ? list : []

		if (refresh) {
			toast.add({
				title: 'Notes loaded',
				description: `Loaded ${files.value.length} notes`,
				color: 'success',
			})
		}
	} catch (e: any) {
		error.value = e?.data?.error || e?.message || 'Failed to load notes'
		toast.add({
			title: 'Failed to load notes',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	} finally {
		loadingList.value = false
	}
}

// Load tag configuration
async function loadTagsConfig(refresh = false) {
	tagsLoading.value = true
	try {
		const res = await $fetch(`${apiBase}/notes/tags`)
		const tags = (res as any)?.tags || []

		tagsConfig.value = Array.isArray(tags) ? tags : []

		if (refresh) {
			toast.add({
				title: 'Tag config loaded',
				description: `Loaded ${tagsConfig.value.length} tags`,
				color: 'success',
			})
		}
	} catch (e: any) {
		console.warn('Failed to load tag config', e?.data?.error || e?.message)
		toast.add({
			title: 'Failed to load tag config',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	} finally {
		tagsLoading.value = false
	}
}

// Save tag configuration
async function saveTagsConfig() {
	tagsSaving.value = true
	try {
		// Validate tags
		const clean = tagsConfig.value.map((t) => t.trim()).filter((t) => !!t)

		await $fetch(`${apiBase}/notes/tags`, { method: 'POST', body: { tags: clean } })

		toast.add({
			title: 'Tag config saved',
			description: `Saved ${clean.length} tags`,
			color: 'success',
		})
	} catch (e: any) {
		console.warn('Failed to save tag config', e?.data?.error || e?.message)
		toast.add({
			title: 'Failed to save tag config',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	} finally {
		tagsSaving.value = false
	}
}

// Handle file selection
function handleChangeFiles(name: string) {
	if (selected.value.includes(name)) {
		selected.value = selected.value.filter((f) => f !== name)
	} else {
		selected.value.push(name)
	}
}

// Process selected notes
async function processSelected() {
	processing.value = true
	error.value = null
	results.value = []

	try {
		// Handle normal processing
		if (!useStreaming.value) {
			const sid = userId.value ? `${userId.value}:${sessionId.value}` : sessionId.value
			const parsedCtx = parseContext(contextJson.value)
			const body: any = {
				paths: selected.value,
				useMemory: useMemory.value,
				sessionId: sid,
				reset: resetMemory.value,
				memorySize: memorySize.value,
				summarizeOverflow: summarizeOverflow.value,
				summaryMaxTokens: summaryMaxTokens.value,
			}
			if (parsedCtx) body.context = parsedCtx
			if (contextBudgetTokens.value) body.contextBudgetTokens = contextBudgetTokens.value
			const res = await $fetch(`${apiBase}/notes/process`, {
				method: 'POST',
				body,
				headers: userId.value ? { 'x-user-id': userId.value } : undefined,
			})

			results.value = ((res as any)?.results || []) as NoteResult[]

			// Save each successful summary to Firestore (unique by file name)
			for (const r of results.value) {
				await saveSummaryRecord(r)
			}

			// History fetching moved to dedicated page

			toast.add({
				title: 'Notes processed',
				description: `Processed ${results.value.length} notes`,
				color: 'success',
			})
		} else {
			// Handle streaming processing
			await processSelectedStreaming()
		}
	} catch (e: any) {
		error.value = e?.data?.error || e?.message || 'Processing failed'
		toast.add({
			title: 'Failed to process notes',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	} finally {
		processing.value = false
	}
}

// Process selected notes using streaming
async function processSelectedStreaming() {
	for (const name of selected.value) {
		await streamSummarizeFile(name)
	}
}

// Stream summarize a file
async function streamSummarizeFile(name: string) {
	return new Promise<void>((resolve) => {
		// Create EventSource to stream results with context/memory controls
		const sid = userId.value ? `${userId.value}:${sessionId.value}` : sessionId.value
		let url = `${apiBase}/notes/summarize-stream?path=${encodeURIComponent(name)}`
		url += `&useMemory=${encodeURIComponent(String(useMemory.value))}`
		url += `&sessionId=${encodeURIComponent(sid)}`
		url += `&memorySize=${encodeURIComponent(memorySize.value)}`
		url += `&summarizeOverflow=${encodeURIComponent(String(summarizeOverflow.value))}`
		url += `&summaryMaxTokens=${encodeURIComponent(summaryMaxTokens.value)}`
		if (resetMemory.value) url += `&reset=true`
		if (contextBudgetTokens.value)
			url += `&contextBudgetTokens=${encodeURIComponent(contextBudgetTokens.value)}`
		if (contextJson.value && contextJson.value.trim())
			url += `&context=${encodeURIComponent(contextJson.value)}`
		const es = new EventSource(url)

		// Initialize partial result object
		const partial: any = { file: name, summary: '', tags: [] }

		// Track completion to avoid treating normal close as an error
		let completed = false

		// Debug: connection opened
		es.addEventListener('open', () => {
			console.log('Stream opened for', partial.file)
		})

		// Handle summary events
		es.addEventListener('summary', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				if (data?.chunk) partial.summary += data.chunk
			} catch {}
		})
		// Handle result events
		es.addEventListener('result', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				partial.summary = data?.summary || partial.summary
				partial.tags = Array.isArray(data?.tags) ? data.tags : partial.tags
				if (typeof data?.model === 'string') partial.model = data.model
			} catch {}
		})
		// Handle evaluation events
		es.addEventListener('evaluation', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				partial.evaluation = data
			} catch {}
		})
		// Handle usage events
		es.addEventListener('usage', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				partial.usage = data
			} catch {}
		})
		// Handle server-sent error events (from API)
		es.addEventListener('server_error', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				toast.add({
					title: 'Failed to process note',
					description: `Error processing ${partial.file}: ${data?.error || 'Unknown error'}`,
					color: 'error',
				})
			} catch {
				toast.add({
					title: 'Failed to process note',
					description: `Error processing ${partial.file}: server error`,
					color: 'error',
				})
			}
			es.close()
		})
		// Handle network errors from EventSource (ignore if stream already completed)
		es.addEventListener('error', (_ev: MessageEvent) => {
			if (completed) {
				es.close()
				return
			}
			console.warn('Stream connection error for', partial.file)
			toast.add({
				title: 'Stream connection error',
				description: `Could not connect: ${partial.file}`,
				color: 'error',
			})
			es.close()
		})
		// Handle end events
		es.addEventListener('end', async () => {
			completed = true
			results.value.push(partial as NoteResult)

			// Save successful streaming result to Firestore (unique by file name)
			await saveSummaryRecord(partial as NoteResult)

			toast.add({
				title: 'Note processed',
				description: `Processed ${partial.file}`,
				color: 'success',
			})
			es.close()
			resolve()
		})
	})
}

// Save summary to Firestore with unique doc id per file name
async function saveSummaryRecord(r: NoteResult) {
	try {
		if (!db) return console.warn('[save] missing db')

		const ref = doc(db, 'notesSummaries', r.file)
		const payload = {
			file: r.file,
			summary: r.summary,
			tags: r.tags || [],
			usage: r.usage || null,
			evaluation: r.evaluation || null,
			model: r.model || null,
			updatedAt: serverTimestamp(),
		}

		// Use setDoc to override existing doc by file name (unique constraint)
		await setDoc(ref, payload, { merge: true })
	} catch (e: any) {
		console.warn('[save] failed:', e?.message || e)
		toast.add({
			title: 'Failed to save summary',
			description: e?.data?.error || e?.message || 'Unknown error',
			color: 'error',
		})
	}
}

// Load saved summary histories from Firestore
// History fetching moved to dedicated page

// Copy text to clipboard
function copyText(text: string) {
	try {
		navigator.clipboard?.writeText(text)
		toast.add({
			title: 'Copied to clipboard',
			description: 'The text has been copied to the clipboard.',
			color: 'success',
		})
	} catch (e) {
		console.warn('Clipboard copy failed', e)
		toast.add({
			title: 'Clipboard copy failed',
			description: 'Unknown error',
			color: 'error',
		})
	}
}
</script>

<template>
	<UContainer class="py-8">
		<!-- Header -->
		<div class="mb-6 flex justify-between items-center">
			<div>
				<h1 class="text-2xl font-semibold">Notes Assistant</h1>
				<p class="text-sm text-grey-700">
					Summarize and tag notes from the repo's <code>notes/</code> folder.
				</p>
			</div>
			<ULink to="/notes/history">
				<UButton color="primary" icon="i-heroicons-document-text">Open History</UButton>
			</ULink>
		</div>

		<UCard>
			<div class="grid gap-6">
				<div>
					<!-- Note List -->
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Note list</span>
						<div class="flex gap-2">
							<UButton
								size="xs"
								color="neutral"
								variant="soft"
								:loading="loadingList"
								icon="i-heroicons-arrow-path"
								@click="loadList(true)"
								>Reload Notes</UButton
							>
						</div>
					</div>
					<div class="text-xs text-gray-600 mb-2 mt-1">Select notes to process.</div>
					<div class="grid md:grid-cols-2 gap-3">
						<UCard v-for="f in files" :key="f.name">
							<div class="flex items-center justify-between">
								<div class="text-sm">{{ f.name }}</div>
								<UCheckbox :value="f.name" @change="handleChangeFiles(f.name)" />
							</div>
						</UCard>
					</div>
				</div>

				<hr class="text-gray-300" />

				<!-- Tag Set -->
				<div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Tag Set</span>
						<div class="flex gap-2">
							<UButton
								size="xs"
								color="neutral"
								variant="soft"
								:loading="tagsLoading"
								@click="loadTagsConfig(true)"
								icon="i-heroicons-arrow-path"
								>Reload Tags</UButton
							>
							<UButton
								size="xs"
								color="primary"
								:loading="tagsSaving"
								@click="saveTagsConfig"
								icon="i-heroicons-check"
								>Save Tags</UButton
							>
						</div>
					</div>
					<div class="text-xs text-gray-600 mb-2 mt-1">Enter after typing each tag.</div>
					<UInputTags v-model="tagsConfig" size="lg" />
				</div>

				<hr class="text-gray-300" />

				<!-- Context & Memory -->
				<div>
					<div class="grid gap-4">
						<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold">Use Memory</span>
								</div>
								<div class="text-xs text-gray-600 mb-2 mt-1">Persist summaries per session.</div>
								<USwitch v-model="useMemory" label="Enable Memory" />
							</div>
							<div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold">Session ID</span>
								</div>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Unique identifier for this session.
								</div>
								<UInput v-model="sessionId" placeholder="notes" class="w-full" />
							</div>
							<div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold">Memory Size</span>
									<span class="text-sm">{{ memorySize }}</span>
								</div>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Number of notes to store in memory.
								</div>
								<USlider v-model="memorySize" :min="1" :max="200" :step="1" />
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
							<div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold">Context Budget Tokens</span>
								</div>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Maximum number of tokens to use for context.
								</div>
								<UInput
									v-model.number="contextBudgetTokens"
									type="number"
									placeholder="auto"
									class="w-full"
								/>
							</div>
							<div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold">Overflow Summarization</span>
								</div>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Summarize overflow context if it exceeds the budget.
								</div>
								<USwitch v-model="summarizeOverflow" label="Summarize overflow context" />
							</div>
							<div>
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold">Summary Max Tokens</span>
									<span class="text-sm">{{ summaryMaxTokens }}</span>
								</div>
								<div class="text-xs text-gray-600 mb-2 mt-1">
									Maximum number of tokens to use for summary.
								</div>
								<USlider v-model="summaryMaxTokens" :min="32" :max="400" :step="8" />
							</div>
						</div>

						<div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-semibold">Reset Memory</span>
							</div>
							<div class="text-xs text-gray-600 mb-2 mt-1">Clear session on next run.</div>
							<USwitch v-model="resetMemory" label="Enable Reset Memory" />
						</div>

						<div class="flex flex-col w-full">
							<span class="text-sm font-semibold">Context JSON</span>
							<div class="text-xs text-gray-600 mb-2 mt-1">
								Optional. Example: { "project": "Acme", "noteType": "meeting" }
							</div>
							<UTextarea v-model="contextJson" :rows="4" placeholder='{\n  "project": "Acme"\n}' />
						</div>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex items-center justify-end gap-3">
					<USwitch
						v-model="useStreaming"
						checked-icon="i-heroicons-wifi"
						unchecked-icon="i-heroicons-no-symbol"
						label="Stream Note"
						description="Real-time result"
					/>
					<UButton
						class="h-full"
						:loading="processing"
						icon="i-heroicons-play"
						@click="processSelected"
						>Run Assistant</UButton
					>
					<UButton
						class="h-full"
						variant="soft"
						color="neutral"
						:disabled="processing"
						icon="i-heroicons-x-mark"
						@click="results = []"
						>Clear Output</UButton
					>
				</div>

				<!-- Error Alert -->
				<UAlert
					v-if="error"
					color="error"
					icon="i-heroicons-exclamation-triangle"
					:description="error"
				/>

				<!-- Processed Results -->
				<div v-if="results.length" class="grid gap-4">
					<UCard v-for="r in results" :key="r.file" class="bg-gray-50">
						<div class="flex items-center justify-between mb-2">
							<span class="text-sm font-semibold">{{ r.file }}</span>
							<UButton
								size="xs"
								color="neutral"
								variant="soft"
								icon="i-heroicons-clipboard"
								@click="copyText(r.summary)"
								>Copy Summary</UButton
							>
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
							Tokens: Prompt {{ r?.usage?.prompt_tokens ?? 0 }} • Completion
							{{ r?.usage?.completion_tokens ?? 0 }} • Total
							{{
								r?.usage?.total_tokens ??
								(r?.usage?.prompt_tokens ?? 0) + (r?.usage?.completion_tokens ?? 0)
							}}
							<div class="my-1 flex items-center gap-2">
								<UBadge size="sm" color="neutral" variant="soft"
									>Model {{ r.model ?? 'gpt-4o-mini' }}</UBadge
								>
								<UBadge
									v-if="estimateCost(r.usage, r.model) !== null"
									size="sm"
									color="primary"
									variant="soft"
								>
									Cost est. ${{ estimateCost(r.usage, r.model) }}
								</UBadge>
							</div>
						</div>
					</UCard>
				</div>
			</div>
		</UCard>
	</UContainer>
</template>
