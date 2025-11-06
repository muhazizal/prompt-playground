<script setup lang="ts">
/**
 * VisionInputs
 * Image URL input and file upload for image vision tasks.
 */
const props = defineProps<{ imageUrl: string }>()
const emit = defineEmits<{ (e: 'update:imageUrl', v: string): void; (e: 'changeImage', ev: Event): void }>()
</script>

<template>
  <div class="grid gap-6">
    <div class="flex flex-col w-full">
      <span class="text-sm font-semibold">Image URL</span>
      <div class="text-xs text-gray-600 mb-2 mt-1">Enter the URL of the image to use with the prompt.</div>
      <UInput :model-value="props.imageUrl" placeholder="https://example.com/image.jpg" @update:model-value="(v) => emit('update:imageUrl', v as string)" />
    </div>
    <div class="flex flex-col w-full">
      <span class="text-sm font-semibold">Or Upload Image</span>
      <div class="text-xs text-gray-600 mb-2 mt-1">Upload an image file to use with the prompt.</div>
      <UInput type="file" accept="image/*" @change="(e) => emit('changeImage', e)" />
    </div>
  </div>
</template>

