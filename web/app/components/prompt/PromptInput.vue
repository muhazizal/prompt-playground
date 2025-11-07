<script setup lang="ts">
/**
 * PromptInput
 * Controlled input component for entering the prompt text.
 */
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function update(value: string) {
	emit('update:modelValue', value)
}
</script>

<template>
	<div class="flex flex-col w-full">
		<label class="text-sm font-semibold mb-2">Prompt Input</label>
		<UTextarea
			:model-value="props.modelValue"
			:rows="6"
			placeholder="Explain about prompt engineering"
			@update:model-value="update"
		/>
	</div>
</template>
