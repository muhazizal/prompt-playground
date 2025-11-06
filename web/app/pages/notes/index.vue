<script setup lang="ts">
import { onMounted } from 'vue'
import type { NoteResult } from '@/helpers/types'
import { parseContext } from '@/helpers/functions'
import NoteList from '@/components/notes/NoteList.vue'
import NotesResultList from '@/components/notes/NotesResultList.vue'
import NotesTagsForm from '~/components/notes/NotesTagsForm.vue'
import { useNotesApi } from '@/composables/useNotesApi'
import { useNotesStream } from '@/composables/useNotesStream'
import { useNotesSave } from '@/composables/useNotesSave'

const toast = useToast()

// Runtime config
const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

// Init Auth
const nuxt = useNuxtApp()
const auth = (nuxt as any).$auth as any
const userId = computed<string | null>(() => (auth?.currentUser?.uid as string) || null)

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

// Load notes on mount
onMounted(async () => {
	await loadList()
	await loadTagsConfig()
})

// Load notes list
const { listNotes, getTags, saveTags, processNotes } = useNotesApi()
const { summarizeFileStream } = useNotesStream()
const { saveSummary } = useNotesSave()

async function loadList(refresh = false) {
	loadingList.value = true
	error.value = null
	try {
		const res = await listNotes()
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
		const res = await getTags()
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
		const clean = tagsConfig.value.map((t) => t.trim()).filter((t) => !!t)
		await saveTags(clean)
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
		if (!useStreaming.value) {
			const sid = userId.value ? `${userId.value}:${sessionId.value}` : sessionId.value
			const ctx = parseContext(contextJson.value)
			const res = await processNotes({
				paths: selected.value,
				useMemory: useMemory.value,
				sessionId: sid,
				reset: resetMemory.value,
				memorySize: memorySize.value,
				summarizeOverflow: summarizeOverflow.value,
				summaryMaxTokens: summaryMaxTokens.value,
				context: ctx || undefined,
				contextBudgetTokens: contextBudgetTokens.value ?? null,
				headers: userId.value ? { 'x-user-id': userId.value } : undefined,
			})
			results.value = ((res as any)?.results || []) as NoteResult[]
			for (const r of results.value) await saveSummary(r)
			toast.add({
				title: 'Notes processed',
				description: `Processed ${results.value.length} notes`,
				color: 'success',
			})
		} else {
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
		const sid = userId.value ? `${userId.value}:${sessionId.value}` : sessionId.value
		const ctxJson = contextJson.value?.trim() ? contextJson.value : null
		const result = await summarizeFileStream(
			{
				baseURL: apiBase,
				path: name,
				useMemory: useMemory.value,
				sessionId: sid,
				memorySize: memorySize.value,
				summarizeOverflow: summarizeOverflow.value,
				summaryMaxTokens: summaryMaxTokens.value,
				reset: resetMemory.value,
				contextBudgetTokens: contextBudgetTokens.value ?? null,
				contextJson: ctxJson,
			},
			{
				onOpen: (file) => console.log('Stream opened for', file),
				onError: (msg) => {
					toast.add({ title: 'Stream error', description: msg, color: 'error' })
				},
				onEnd: async (r) => {
					results.value.push(r)
					await saveSummary(r)
					toast.add({
						title: 'Note processed',
						description: `Processed ${r.file}`,
						color: 'success',
					})
				},
			}
		)
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
							>
								Reload Notes
							</UButton>
						</div>
					</div>
					<NoteList
						:files="files"
						:selected="selected"
						:loading="loadingList"
						@toggle="handleChangeFiles"
					/>
				</div>

				<hr class="text-gray-300" />

				<!-- Tag Set -->
				<div>
					<NotesTagsForm
						v-model="tagsConfig"
						:loading="tagsLoading"
						:saving="tagsSaving"
						@reload="loadTagsConfig(true)"
						@save="saveTagsConfig"
					/>
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

						<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
						icon="i-heroicons-play"
						:loading="processing"
						:disabled="selected.length === 0"
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
				<NotesResultList :results="results" @copy="copyText" />
			</div>
		</UCard>
	</UContainer>
</template>
