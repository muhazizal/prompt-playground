<script setup lang="ts">
defineProps<{
	title: string
	subtitle?: string
	meta?: string
	body?: string
	imageSrc?: string
}>()
</script>

<template>
	<UCard>
		<div class="flex items-center justify-between text-sm mb-2">
			<span>{{ meta }}</span>
			<span>{{ subtitle }}</span>
		</div>
		<div class="grid gap-2">
			<div v-if="title">
				<strong>{{ title }}</strong>
			</div>
			<div v-if="imageSrc" class="mt-1">
				<img :src="imageSrc" alt="preview" class="max-h-48 rounded" />
			</div>
			<div v-if="body" class="text-sm whitespace-pre-wrap">
				{{ body }}
			</div>
		</div>
	</UCard>
</template>
