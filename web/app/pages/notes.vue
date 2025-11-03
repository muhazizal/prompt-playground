<script setup lang="ts">
const runtime = useRuntimeConfig().public
const apiBase = runtime.apiBase

type Evaluation = { coverage: number; concision: number; feedback?: string }
type NoteResult = {
	file: string
	summary: string
	tags: string[]
	usage?: any
	evaluation?: Evaluation
}

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

onMounted(async () => {
	await loadList()
	await loadTagsConfig()
})

async function loadList() {
	loadingList.value = true
	error.value = null

	try {
		const res = await $fetch(`${apiBase}/notes/list`)
		const list = (res as any)?.files || []

		files.value = Array.isArray(list) ? list : []
		selected.value = files.value.slice(0, 2).map((f) => f.name)
	} catch (e: any) {
		error.value = e?.data?.error || e?.message || 'Failed to load notes'
	} finally {
		loadingList.value = false
	}
}

async function loadTagsConfig() {
	tagsLoading.value = true
	try {
		const res = await $fetch(`${apiBase}/notes/tags`)
		const tags = (res as any)?.tags || []

		tagsConfig.value = Array.isArray(tags) ? tags : []
	} catch (e: any) {
		console.warn('Failed to load tag config', e?.data?.error || e?.message)
	} finally {
		tagsLoading.value = false
	}
}

async function saveTagsConfig() {
	tagsSaving.value = true
	try {
		const clean = tagsConfig.value.map((t) => t.trim()).filter((t) => !!t)

		await $fetch(`${apiBase}/notes/tags`, { method: 'POST', body: { tags: clean } })
	} catch (e: any) {
		console.warn('Failed to save tag config', e?.data?.error || e?.message)
	} finally {
		tagsSaving.value = false
	}
}

function handleChangeFiles(name: string) {
	if (selected.value.includes(name)) {
		selected.value = selected.value.filter((f) => f !== name)
	} else {
		selected.value.push(name)
	}
}

async function processSelected() {
	processing.value = true
	error.value = null
	results.value = []

	try {
		if (!useStreaming.value) {
			const res = await $fetch(`${apiBase}/notes/process`, {
				method: 'POST',
				body: { paths: selected.value },
			})

			results.value = ((res as any)?.results || []) as NoteResult[]
		} else {
			await processSelectedStreaming()
		}
	} catch (e: any) {
		error.value = e?.data?.error || e?.message || 'Processing failed'
	} finally {
		processing.value = false
	}
}

async function processSelectedStreaming() {
	for (const name of selected.value) {
		await streamSummarizeFile(name)
	}
}

async function streamSummarizeFile(name: string) {
	return new Promise<void>((resolve) => {
		const es = new EventSource(`${apiBase}/notes/summarize-stream?path=${encodeURIComponent(name)}`)
		const partial: any = { file: name, summary: '', tags: [] }

		es.addEventListener('summary', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				if (data?.chunk) partial.summary += data.chunk
			} catch {}
		})
		es.addEventListener('result', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				partial.summary = data?.summary || partial.summary
				partial.tags = Array.isArray(data?.tags) ? data.tags : partial.tags
			} catch {}
		})
		es.addEventListener('evaluation', (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data)
				partial.evaluation = data
			} catch {}
		})
		es.addEventListener('error', (ev: MessageEvent) => {
			console.warn('Stream error', ev)
		})
		es.addEventListener('end', () => {
			results.value.push(partial as NoteResult)
			es.close()
			resolve()
		})
	})
}

function copyText(text: string) {
	try {
		navigator.clipboard?.writeText(text)
	} catch (e) {
		console.warn('Clipboard copy failed', e)
	}
}
</script>

<template>
	<UContainer class="py-8">
		<h1 class="text-2xl font-semibold mb-6">AI Notes Assistant</h1>

		<UCard>
			<div class="grid gap-6">
				<div class="flex items-center justify-between">
					<div class="text-sm">Select notes from the repo's <code>notes/</code> folder.</div>
					<div class="flex gap-2">
						<UButton
							color="neutral"
							variant="soft"
							:loading="loadingList"
							icon="i-heroicons-arrow-path"
							@click="loadList"
							>Reload</UButton
						>
						<UButton :loading="processing" icon="i-heroicons-sparkles" @click="processSelected"
							>Process Selected</UButton
						>
						<USwitch
							v-model="useStreaming"
							checked-icon="i-heroicons-wifi"
							unchecked-icon="i-heroicons-no-symbol"
							label="Streaming"
							description="Process notes"
						/>
					</div>
				</div>

				<UCard>
					<div class="flex items-center justify-between mb-2">
						<strong>Tag Set</strong>
						<div class="flex gap-2">
							<UButton
								size="xs"
								color="neutral"
								variant="soft"
								:loading="tagsLoading"
								@click="loadTagsConfig"
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
					<div class="text-xs text-gray-600 mb-2">Edit tags as comma-separated values.</div>
					<UTextarea
						v-model="(tagsConfig as any)"
						class="w-full"
						:rows="3"
						:value="tagsConfig.join(', ')"
						@update:model-value="(val: string) => { tagsConfig = (val || '').split(',').map(t => t.trim()).filter(t => !!t) as any }"
					/>
				</UCard>

				<div class="grid md:grid-cols-2 gap-3">
					<UCard v-for="f in files" :key="f.name">
						<div class="flex items-center justify-between">
							<div class="text-sm">{{ f.name }}</div>
							<UCheckbox :value="f.name" @change="handleChangeFiles(f.name)" />
						</div>
					</UCard>
				</div>

				<UAlert
					v-if="error"
					color="error"
					icon="i-heroicons-exclamation-triangle"
					:description="error"
				/>

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
