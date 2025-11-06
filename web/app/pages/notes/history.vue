<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

import AppBreadcrumb from '@/components/app/AppBreadcrumb.vue'
import HistoryList from '@/components/history/HistoryList.vue'
import HistorySimpleCard from '@/components/history/HistorySimpleCard.vue'
import { useNotesHistoryMappers } from '@/composables/useNotesHistoryMappers'

const breadcrumb: BreadcrumbItem[] = [
	{ label: 'Notes Assistant', to: '/notes' },
	{ label: 'History' },
]

// Mapper composable
const { mapSummary } = useNotesHistoryMappers()
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
