<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type { HistoryEntry } from '@/helpers/types'

import AppBreadcrumb from '@/components/app/AppBreadcrumb.vue'
import HistoryList from '@/components/history/HistoryList.vue'
import HistoryPromptCard from '@/components/history/HistoryPromptCard.vue'
import HistorySimpleCard from '@/components/history/HistorySimpleCard.vue'
import { usePromptHistoryMappers } from '~/composables/usePromptHistoryMappers'

// Breadcrumb
const breadcrumb: BreadcrumbItem[] = [
	{ label: 'Prompt Playground', to: '/prompt' },
	{ label: 'History' },
]

// Tabs (per-type only)
const tab = ref<'text' | 'vision' | 'stt' | 'tts' | 'image'>('text')
const tabs = [
	{ label: 'Text Generation', value: 'text' },
	{ label: 'Image Generation', value: 'image' },
	{ label: 'Image Vision', value: 'vision' },
	{ label: 'Speech → Text', value: 'stt' },
	{ label: 'Text → Speech', value: 'tts' },
]

// Shared mappers
const { mapPlayground, mapVision, mapTranscription, mapTTS, mapImageGen } =
	usePromptHistoryMappers()
</script>

<template>
	<UContainer class="py-8 space-y-6">
		<AppBreadcrumb :items="breadcrumb" />

		<div>
			<UTabs v-model="tab" :items="tabs" />
		</div>

		<div v-if="tab === 'text'">
			<HistoryList
				collection="promptTextHistory"
				order-field="createdAt"
				:page-size="10"
				:map-doc="mapPlayground"
				title="Text Generation History"
			>
				<template #item="{ item }">
					<HistoryPromptCard :entry="(item as HistoryEntry)" />
				</template>
			</HistoryList>
		</div>
		<div v-if="tab === 'vision'">
			<HistoryList
				collection="visionHistory"
				order-field="createdAt"
				:page-size="10"
				:map-doc="mapVision"
				title="Image Vision History"
			>
				<template #item="{ item }">
					<HistorySimpleCard
						:title="item.prompt ? 'Prompt' : 'Vision Result'"
						:meta="`Model: ${item.model}`"
						:subtitle="new Date(item.at).toLocaleString()"
						:image-src="item.imageUrl"
						:body="item.text"
					/>
				</template>
			</HistoryList>
		</div>
		<div v-if="tab === 'stt'">
			<HistoryList
				collection="transcriptionHistory"
				order-field="createdAt"
				:page-size="10"
				:map-doc="mapTranscription"
				title="Speech → Text History"
			>
				<template #item="{ item }">
					<HistorySimpleCard
						title="Transcription"
						:meta="`Model: ${item.model}`"
						:subtitle="new Date(item.at).toLocaleString()"
						:body="item.text"
					/>
				</template>
			</HistoryList>
		</div>
		<div v-if="tab === 'tts'">
			<HistoryList
				collection="ttsHistory"
				order-field="createdAt"
				:page-size="10"
				:map-doc="mapTTS"
				title="Text → Speech History"
			>
				<template #item="{ item }">
					<HistorySimpleCard
						:title="`Voice: ${item.voice || 'default'}`"
						:meta="`Model: ${item.model}`"
						:subtitle="new Date(item.at).toLocaleString()"
						:body="item.text"
					/>
				</template>
			</HistoryList>
		</div>
		<div v-if="tab === 'image'">
			<HistoryList
				collection="imageGenHistory"
				order-field="createdAt"
				:page-size="10"
				:map-doc="mapImageGen"
				title="Image Generation History"
			>
				<template #item="{ item }">
					<HistorySimpleCard
						:title="`Size: ${item.size || 'auto'}`"
						:meta="`Model: ${item.model}`"
						:subtitle="new Date(item.at).toLocaleString()"
						:body="item.prompt"
					/>
				</template>
			</HistoryList>
		</div>
	</UContainer>
</template>
