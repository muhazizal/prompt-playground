<script setup lang="ts">
import { Firestore } from 'firebase/firestore'
import { getDocs, addDoc, collection, serverTimestamp } from 'firebase/firestore'
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
const loadingList = ref(false)
const processing = ref(false)
const error = ref<string | null>(null)
const useStreaming = ref(false)

// Tag configuration
const tagsConfig = ref<string[]>([])
const tagsLoading = ref(false)
const tagsSaving = ref(false)

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
			const res = await $fetch(`${apiBase}/notes/process`, {
				method: 'POST',
				body: { paths: selected.value },
			})

			results.value = ((res as any)?.results || []) as NoteResult[]
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
		// Handle error events
		es.addEventListener('error', (ev: MessageEvent) => {
			console.warn('Stream error', ev)
			toast.add({
				title: 'Failed to process note',
				description: `Error processing ${partial.file}: ${ev.data}`,
				color: 'error',
			})
			es.close()
		})
		// Handle end events
		es.addEventListener('end', () => {
			results.value.push(partial as NoteResult)
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
			<h1 class="text-2xl font-semibold">AI Notes Assistant</h1>
			<p class="text-sm text-grey-700">
				Summarize and tag notes from the repo's <code>notes/</code> folder.
			</p>
		</div>

		<UCard>
			<div class="grid gap-10">
				<div>
					<!-- Note List -->
					<div class="flex items-center justify-between mb-3">
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
							{{ (r.evaluation.concision * 100).toFixed(0) }}%
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
	</UContainer>
</template>
