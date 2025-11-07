<script setup lang="ts">
/**
 * ImageGenInputs
 * Image size selection for image generation tasks.
 */
const props = defineProps<{ imageSizeOptions: string[]; imageSize: string }>()
const emit = defineEmits<{ (e: 'update:imageSize', v: string): void }>()
</script>

<template>
	<div class="grid gap-3">
		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Size</label>
			<USelectMenu
				:model-value="props.imageSize"
				:items="props.imageSizeOptions"
				@update:model-value="(v) => emit('update:imageSize', v as string)"
			/>
		</div>
	</div>
</template>
