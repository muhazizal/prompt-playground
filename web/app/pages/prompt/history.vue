<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type {
	HistoryEntry,
	VisionHistory,
	TranscriptionHistory,
	TTSHistory,
	ImageGenHistory,
} from '@/helpers/types'
import type { QueryDocumentSnapshot, Timestamp } from 'firebase/firestore'

import AppBreadcrumb from '~/components/app/AppBreadcrumb.vue'
import HistoryList from '~/components/history/HistoryList.vue'
import HistoryPromptCard from '~/components/history/HistoryPromptCard.vue'
import HistorySimpleCard from '~/components/history/HistorySimpleCard.vue'

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

// Mappers
function mapPlayground(doc: QueryDocumentSnapshot<HistoryEntry>): HistoryEntry {
	const data = doc.data() as any
	const createdAt = data?.createdAt as Timestamp | undefined
	const at = createdAt?.toDate?.() ? createdAt.toDate().getTime() : data?.at ?? Date.now()
	return { id: doc.id, ...data, at } as HistoryEntry
}

function mapVision(doc: QueryDocumentSnapshot<VisionHistory>): VisionHistory {
	const data = doc.data() as any
	return { id: doc.id, ...data } as VisionHistory
}
function mapTranscription(doc: QueryDocumentSnapshot<TranscriptionHistory>): TranscriptionHistory {
	const data = doc.data() as any
	return { id: doc.id, ...data } as TranscriptionHistory
}
function mapTTS(doc: QueryDocumentSnapshot<TTSHistory>): TTSHistory {
	const data = doc.data() as any
	return { id: doc.id, ...data } as TTSHistory
}
function mapImageGen(doc: QueryDocumentSnapshot<ImageGenHistory>): ImageGenHistory {
	const data = doc.data() as any
	return { id: doc.id, ...data } as ImageGenHistory
}
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
