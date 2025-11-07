<script setup lang="ts">
/**
 * TextContextPanel
 * Context & memory controls for text-generation tasks.
 */
const props = defineProps<{
	useMemory: boolean
	sessionId: string
	memorySize: number
	contextBudgetTokens: number | null
	summarizeOverflow: boolean
	summaryMaxTokens: number
	resetMemory: boolean
	contextJson: string
}>()

const emit = defineEmits<{
	(e: 'update:useMemory', v: boolean): void
	(e: 'update:sessionId', v: string): void
	(e: 'update:memorySize', v: number): void
	(e: 'update:contextBudgetTokens', v: number | null): void
	(e: 'update:summarizeOverflow', v: boolean): void
	(e: 'update:summaryMaxTokens', v: number): void
	(e: 'update:resetMemory', v: boolean): void
	(e: 'update:contextJson', v: string): void
}>()
</script>

<template>
	<div class="grid gap-4">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Use Memory -->
			<div class="flex flex-col w-full">
				<label class="text-sm font-semibold mb-2">Use Memory</label>
				<USwitch
					:model-value="props.useMemory"
					label="Enable memory"
					@update:model-value="(v) => emit('update:useMemory', v as boolean)"
				/>
			</div>
			<!-- Session ID -->
			<div class="flex flex-col w-full">
				<label class="text-sm font-semibold mb-2">Session ID</label>
				<UInput
					:model-value="props.sessionId"
					placeholder="chat"
					class="w-full"
					@update:model-value="(v) => emit('update:sessionId', v as string)"
				/>
			</div>
			<!-- Memory Size -->
			<div class="flex flex-col w-full">
				<div class="flex items-center justify-between mb-2">
					<label class="text-sm font-semibold">Memory Size</label>
					<span class="text-xs text-gray-500">{{ props.memorySize }}</span>
				</div>
				<USlider
					:model-value="props.memorySize"
					:min="1"
					:max="200"
					:step="1"
					@update:model-value="(v) => emit('update:memorySize', v as number)"
				/>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Context Budget Tokens -->
			<div class="flex flex-col w-full">
				<label class="text-sm font-semibold mb-2">Context Budget Tokens</label>
				<UInput
					:model-value="props.contextBudgetTokens"
					type="number"
					placeholder="auto"
					class="w-full"
					@update:model-value="(v) => emit('update:contextBudgetTokens', (v as any) ?? null)"
				/>
			</div>
			<!-- Overflow Summarization -->
			<div class="flex flex-col w-full">
				<label class="text-sm font-semibold mb-2">Overflow Summarization</label>
				<USwitch
					:model-value="props.summarizeOverflow"
					label="Enable overflow summarization"
					@update:model-value="(v) => emit('update:summarizeOverflow', v as boolean)"
				/>
			</div>
			<!-- Summary Max Tokens -->
			<div class="flex flex-col w-full">
				<div class="flex items-center justify-between mb-2">
					<label class="text-sm font-semibold">Summary Max Tokens</label>
					<span class="text-xs text-gray-500">{{ props.summaryMaxTokens }}</span>
				</div>
				<USlider
					:model-value="props.summaryMaxTokens"
					:min="32"
					:max="400"
					:step="8"
					@update:model-value="(v) => emit('update:summaryMaxTokens', v as number)"
				/>
			</div>
		</div>

		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Reset Memory</label>
			<USwitch
				:model-value="props.resetMemory"
				label="Enable reset memory"
				@update:model-value="(v) => emit('update:resetMemory', v as boolean)"
			/>
		</div>

		<div class="flex flex-col w-full">
			<label class="text-sm font-semibold mb-2">Context JSON</label>
			<UTextarea
				:model-value="props.contextJson"
				:rows="4"
				placeholder='{"project":"Acme"}'
				@update:model-value="(v) => emit('update:contextJson', v as string)"
			/>
		</div>
	</div>
</template>
