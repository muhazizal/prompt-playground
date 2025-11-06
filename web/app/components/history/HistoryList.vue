<script setup lang="ts">
import { onMounted } from 'vue'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { useFirestorePagination } from '@/composables/useFirestorePagination'

type MapDoc<T = any> = (doc: QueryDocumentSnapshot<T>) => any

const props = defineProps<{
	collection: string
	orderField: string
	pageSize?: number
  mapDoc?: MapDoc<any>
	title?: string
}>()

const emit = defineEmits<{ (e: 'loaded'): void }>()

const pager = useFirestorePagination<any>({
	collectionName: props.collection,
	orderField: props.orderField,
	pageSize: props.pageSize ?? 10,
	mapDoc: props.mapDoc,
})

onMounted(async () => {
	await pager.loadFirst()
	emit('loaded')
})

function next() {
	pager.loadNext()
}
function prev() {
	pager.loadPrev()
}
</script>

<template>
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<strong v-if="props.title">{{ props.title }}</strong>
			<div class="flex items-center gap-2">
				<UButton
					color="neutral"
					variant="soft"
					:disabled="!pager.hasPrev.value || pager.loading.value"
					@click="prev"
				>
					Previous
				</UButton>
				<span class="text-sm text-gray-500">Page {{ pager.page.value }}</span>
				<UButton
					color="neutral"
					variant="soft"
					:disabled="!pager.hasNext.value || pager.loading.value"
					@click="next"
				>
					Next
				</UButton>
			</div>
		</div>

		<div v-if="pager.loading.value" class="space-y-2">
			<USkeleton class="h-6 w-full" />
			<USkeleton class="h-24 w-full" />
			<USkeleton class="h-16 w-2/3" />
		</div>

		<UAlert
			v-else-if="pager.error.value"
			color="error"
			:title="'Failed to load'"
			:description="pager.error.value || ''"
		/>

		<div v-else>
			<div v-if="pager.items.value.length > 0" class="space-y-3">
				<slot name="item" v-for="(item, i) in pager.items.value" :item="item" :index="i" :key="i">
					<UCard>
						<pre class="text-xs whitespace-pre-wrap">{{ item }}</pre>
					</UCard>
				</slot>
			</div>
			<div v-else>
				<p class="text-sm text-gray-500">No items found.</p>
			</div>
		</div>
	</div>
</template>
