<script setup lang="ts">
/**
 * PromptTaskPanel
 * Task/temperature/samples/maxTokens configuration panel.
 */
import { temperatureOptions } from '@/helpers/constants'

export type TaskOption = { label: string; task: string; model: string }

const props = defineProps<{
	selectedTask: TaskOption
	taskOptions: TaskOption[]
	loadingModels?: boolean
	temperatureSelection: Array<{ label: string; value: number }>
	samples: number
	maxTokens: number
	useStreaming: boolean
}>()

const emit = defineEmits<{
	(e: 'update:selectedTask', v: TaskOption): void
	(e: 'update:temperatureSelection', v: Array<{ label: string; value: number }>): void
	(e: 'update:samples', v: number): void
	(e: 'update:maxTokens', v: number): void
}>()
</script>

<template>
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
		<!-- Task Selection -->
		<div>
			<div class="flex items-center justify-between mb-2">
				<label class="text-sm font-semibold">Task</label>
				<span class="text-xs text-gray-500">{{ props.selectedTask.model }}</span>
			</div>
			<USelectMenu
				:model-value="props.selectedTask"
				:items="props.taskOptions"
				:disabled="props.loadingModels"
				:loading="props.loadingModels"
				class="w-full"
				@update:model-value="(v) => emit('update:selectedTask', v)"
			/>
		</div>

		<!-- Temperatures -->
		<div v-if="props.selectedTask.task === 'text-generation'">
			<div class="flex items-center justify-between mb-2">
				<label class="text-sm font-semibold">Temperatures</label>
				<span class="text-xs text-gray-500">{{
					props.temperatureSelection.map((t) => t.label).join(', ') || 'None'
				}}</span>
			</div>
			<USelectMenu
				:model-value="props.temperatureSelection"
				:items="temperatureOptions"
				multiple
				class="w-full"
				@update:model-value="(v) => emit('update:temperatureSelection', v)"
			/>
		</div>

		<!-- Samples -->
		<div v-if="props.selectedTask.task === 'text-generation'">
			<div class="flex items-center justify-between mb-2">
				<label class="text-sm font-semibold">Samples</label>
				<span class="text-xs text-gray-500">{{ props.samples }}</span>
			</div>
			<USlider
				:model-value="props.samples"
				:min="1"
				:max="5"
				:step="1"
				:disabled="props.useStreaming"
				@update:model-value="(v) => emit('update:samples', v as number)"
			/>
		</div>

		<!-- Max Tokens -->
		<div v-if="['text-generation', 'image-vision'].includes(props.selectedTask.task)">
			<div class="flex items-center justify-between mb-2">
				<label class="text-sm font-semibold">Max Tokens</label>
				<span class="text-xs text-gray-500">{{ props.maxTokens }}</span>
			</div>
			<USlider
				:model-value="props.maxTokens"
				:min="32"
				:max="1024"
				:step="16"
				@update:model-value="(v) => emit('update:maxTokens', v as number)"
			/>
		</div>
	</div>
</template>
