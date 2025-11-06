<script setup lang="ts">
const props = defineProps<{
	modelValue: string[]
	loading?: boolean
	saving?: boolean
}>()
const emit = defineEmits<{
	(e: 'update:modelValue', tags: string[]): void
	(e: 'reload'): void
	(e: 'save'): void
}>()

function update(tags: string[]) {
	emit('update:modelValue', tags)
}
</script>

<template>
	<div>
		<div class="flex items-center justify-between">
			<span class="text-sm font-semibold">Tag Set</span>
			<div class="flex gap-2">
				<UButton
					size="xs"
					color="neutral"
					variant="soft"
					:loading="props.loading"
					@click="emit('reload')"
					icon="i-heroicons-arrow-path"
				>
					Reload Tags
				</UButton>
				<UButton
					size="xs"
					color="primary"
					:loading="props.saving"
					@click="emit('save')"
					icon="i-heroicons-check"
				>
					Save Tags
				</UButton>
			</div>
		</div>
		<div class="text-xs text-gray-600 mb-2 mt-1">Enter after typing each tag.</div>
		<UInputTags :model-value="props.modelValue" size="lg" @update:model-value="update" />
	</div>
</template>
