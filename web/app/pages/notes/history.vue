<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type { NoteResult } from '@/helpers/types'
import type { QueryDocumentSnapshot, Timestamp } from 'firebase/firestore'

import AppBreadcrumb from '~/components/app/AppBreadcrumb.vue'
import HistoryList from '~/components/history/HistoryList.vue'
import HistorySimpleCard from '~/components/history/HistorySimpleCard.vue'

const breadcrumb: BreadcrumbItem[] = [
	{ label: 'Notes Assistant', to: '/notes' },
	{ label: 'History' },
]

function mapSummary(doc: QueryDocumentSnapshot<NoteResult>): NoteResult {
	const data = doc.data() as any
	const updatedAt = data?.updatedAt as Timestamp | undefined
	const model = typeof data?.model === 'string' ? data.model : ''
	const summary = typeof data?.summary === 'string' ? data.summary : ''
	const file = typeof data?.file === 'string' ? data.file : doc.id
	const tags = Array.isArray(data?.tags) ? data.tags : []
	const usage = data?.usage ?? null
	const evaluation = data?.evaluation ?? null
	return { file, summary, tags, usage, evaluation, model }
}
</script>

<template>
	<UContainer class="py-8 space-y-6">
		<AppBreadcrumb :items="breadcrumb" />

		<HistoryList
			collection="notesSummaries"
			order-field="updatedAt"
			:page-size="10"
			:map-doc="mapSummary"
			title="Notes History"
		>
			<template #item="{ item }">
				<HistorySimpleCard
					:title="item.file"
					:meta="item.model ? `Model: ${item.model}` : ''"
					:subtitle="''"
					:body="item.summary"
				/>
			</template>
		</HistoryList>
	</UContainer>
</template>
