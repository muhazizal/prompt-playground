<script setup lang="ts">
const props = defineProps<{
	files: Array<{ name: string }>
	loading?: boolean
}>()

const emit = defineEmits<{ (e: 'toggle', name: string): void }>()

function onToggle(name: string) {
	emit('toggle', name)
}
</script>

<template>
	<div>
		<div class="text-xs text-gray-600 mb-2 mt-1">Select notes to process.</div>
		<div class="grid md:grid-cols-2 gap-3">
			<UCard v-for="f in props.files" :key="f.name">
				<div class="flex items-center justify-between">
					<div class="text-sm">{{ f.name }}</div>
					<UCheckbox :value="f.name" @change="onToggle(f.name)" />
				</div>
			</UCard>
		</div>
	</div>
	<div v-if="props.loading" class="mt-2 text-xs text-gray-500">Loading notes…</div>
</template>
