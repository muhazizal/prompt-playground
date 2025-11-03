<script setup lang="ts">
import { Firestore } from 'firebase/firestore'
import { getDocs, setDoc, doc, collection, serverTimestamp } from 'firebase/firestore'
import type { NoteResult } from '@/helpers/types'

const toast = useToast()

// Runtime config
const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

// Init Firestore
const nuxt = useNuxtApp()
const db = (nuxt as any).$db as Firestore | undefined

// Notes state
const files = ref<Array<{ name: string }>>([])
const selected = ref<string[]>([])
const results = ref<NoteResult[]>([])
const history = ref<NoteResult[]>([])
const loadingList = ref(false)
const processing = ref(false)
const error = ref<string | null>(null)
const useStreaming = ref(false)
const loadingHistory = ref(false)

// Tag configuration
const tagsConfig = ref<string[]>([])
const tagsLoading = ref(false)
const tagsSaving = ref(false)

// Load notes on mount
onMounted(async () => {
	await loadList()
	await loadTagsConfig()
	await loadSummaryHistory()
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
			const res = await $fetch(`${apiBase}/notes/process`, {
				method: 'POST',
				body: { paths: selected.value },
			})

			results.value = ((res as any)?.results || []) as NoteResult[]

			// Save each successful summary to Firestore (unique by file name)
			for (const r of results.value) {
				await saveSummaryRecord(r)
			}

			// Refresh summary history after saving
			await loadSummaryHistory()

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
		// Create EventSource to stream results
		const es = new EventSource(`${apiBase}/notes/summarize-stream?path=${encodeURIComponent(name)}`)

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

		const ref = doc(db, 'summaries', r.file)
		const payload = {
			file: r.file,
			summary: r.summary,
			tags: r.tags || [],
			usage: r.usage || null,
			evaluation: r.evaluation || null,
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
async function loadSummaryHistory() {
	loadingHistory.value = true
	try {
		if (!db) return console.warn('[history] missing db')

		const querySnapshot = await getDocs(collection(db, 'summaries'))
		const list: NoteResult[] = querySnapshot.docs.map((doc) => {
			const data = doc.data() as any
			const file = typeof data?.file === 'string' && data.file.length > 0 ? data.file : doc.id
			const summary = typeof data?.summary === 'string' ? data.summary : ''
			const tags = Array.isArray(data?.tags)
				? data.tags.filter((t: any) => typeof t === 'string')
				: []
			const usage = data?.usage ?? null
			const evaluation = data?.evaluation ?? null
			return { file, summary, tags, usage, evaluation } as NoteResult
		})

		history.value = Array.isArray(list) ? list : []
	} catch (e: any) {
		console.warn('[history] failed:', e?.message || e)
	} finally {
		loadingHistory.value = false
	}
}

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
		<div class="mb-6 space-y-1">
			<h1 class="text-2xl font-semibold">Notes Assistant</h1>
			<p class="text-sm text-grey-700">
				Summarize and tag notes from the repo's <code>notes/</code> folder.
			</p>
		</div>

		<UCard>
			<div class="grid gap-10">
				<div>
					<!-- Note List -->
					<div class="flex items-center justify-between mb-1">
						<strong>Note list</strong>
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
					<div class="text-xs text-gray-600 mb-3">Select notes to process.</div>
					<div class="grid md:grid-cols-2 gap-3">
						<UCard v-for="f in files" :key="f.name">
							<div class="flex items-center justify-between">
								<div class="text-sm">{{ f.name }}</div>
								<UCheckbox :value="f.name" @change="handleChangeFiles(f.name)" />
							</div>
						</UCard>
					</div>
				</div>

				<!-- Tag Set -->
				<div>
					<div class="flex items-center justify-between mb-1">
						<strong>Tag Set</strong>
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
					<div class="text-xs text-gray-600 mb-3">Enter after typing each tag.</div>
					<UInputTags v-model="tagsConfig" size="lg" />
				</div>

				<!-- Action Buttons -->
				<div class="flex items-center justify-start gap-3">
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
						icon="i-heroicons-sparkles"
						@click="processSelected"
						>Process Selected</UButton
					>
					<UButton
						class="h-full"
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
							<strong>{{ r.file }}</strong>
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
						</div>
					</UCard>
				</div>
			</div>
		</UCard>

		<!-- Summary History -->
		<div class="mt-6">
			<div class="flex items-center justify-between mb-1">
				<strong>Summary History</strong>
				<UButton
					size="xs"
					color="neutral"
					variant="soft"
					icon="i-heroicons-arrow-path"
					:loading="loadingHistory"
					@click="loadSummaryHistory()"
					>Reload History</UButton
				>
			</div>
			<div v-if="history.length" class="grid gap-3 mt-2">
				<UCard v-for="h in history" :key="h.file">
					<div class="flex items-center justify-between mb-1">
						<strong>{{ h.file }}</strong>
						<div class="text-xs text-gray-500">
							Tokens: Prompt {{ h?.usage?.prompt_tokens ?? 0 }} • Completion
							{{ h?.usage?.completion_tokens ?? 0 }} • Total
							{{
								h?.usage?.total_tokens ??
								(h?.usage?.prompt_tokens ?? 0) + (h?.usage?.completion_tokens ?? 0)
							}}
						</div>
					</div>
					<div class="text-sm line-clamp-4">{{ h.summary }}</div>
					<div class="mt-2 flex flex-wrap gap-2">
						<UBadge v-for="t in h.tags" :key="t" color="primary" variant="soft">{{ t }}</UBadge>
					</div>
					<div v-if="h.evaluation" class="mt-2 text-xs text-gray-700">
						Coverage {{ (h.evaluation.coverage * 100).toFixed(0) }}% • Concision
						{{ (h.evaluation.concision * 100).toFixed(0) }}% • Formatting
						{{ ((h.evaluation.formatting ?? 0) * 100).toFixed(0) }}% • Factuality
						{{ ((h.evaluation.factuality ?? 0) * 100).toFixed(0) }}%
					</div>
				</UCard>
			</div>
			<div v-else class="text-xs text-gray-500">No history available.</div>
		</div>
	</UContainer>
</template>
