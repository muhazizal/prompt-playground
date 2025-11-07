<script setup lang="ts">
/**
 * VisionInputs
 * Image URL input and file upload for image vision tasks.
 */
const props = defineProps<{ imageUrl: string }>()
const emit = defineEmits<{
	(e: 'update:imageUrl', v: string): void
	(e: 'changeImage', ev: Event): void
}>()
</script>

<template>
	<div class="grid gap-6">
		<!-- Image URL -->
		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Image URL</label>
			<UInput
				:model-value="props.imageUrl"
				placeholder="https://example.com/image.jpg"
				@update:model-value="(v) => emit('update:imageUrl', v as string)"
			/>
		</div>
		<!-- Or Upload Image -->
		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Or Upload Image</label>
			<UInput type="file" accept="image/*" @change="(e) => emit('changeImage', e)" />
		</div>
	</div>
</template>
