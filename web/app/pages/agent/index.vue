<script setup lang="ts">
// Mini Agent page using unified useAgent composable
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import { useAgent } from '@/composables/useAgent'

const { messages, status, input, send, preloadHistory } = useAgent()

// Local UI state: loading indicator and brief completion animation
const isLoading = computed(() => status.value === 'submitted' || status.value === 'streaming')
const justCompleted = ref(false)
const lastAssistantId = computed(() => {
	const assistants = messages.value.filter((m: any) => m.role === 'assistant')
	return assistants.length ? assistants[assistants.length - 1].id : null
})

watch(status, (s, prev) => {
	if (prev !== 'ready' && s === 'ready') {
		justCompleted.value = true
		setTimeout(() => (justCompleted.value = false), 800)
	}
})

onMounted(() => {
	preloadHistory(20)
})
</script>

<template>
	<UContainer class="py-8">
		<div class="mb-6 w-fit">
			<div class="flex items-center justify-between mb-1">
				<h1 class="text-2xl font-semibold">Mini Agent</h1>
				<UBadge icon="i-simple-icons-openai" size="sm" label="gpt-4o-mini" variant="subtle" />
			</div>
			<p class="text-gray-600 text-sm flex items-center gap-2">
				<span>Chat with agent and being remembered.</span>
			</p>
		</div>

		<hr class="text-gray-300 my-6" />

		<UChatMessages :messages="messages" :status="status" compact>
			<template #content="{ message }">
				<div
					class="*:first:mt-0 *:last:mb-0 transition-transform duration-300"
					:class="
						message.role === 'assistant' && message.id === lastAssistantId && justCompleted
							? 'scale-[1.02]'
							: ''
					"
				>
					{{ getTextFromMessage(message) }}
				</div>
			</template>
		</UChatMessages>

		<div v-if="isLoading" class="flex items-center gap-2 px-2.5 pb-3 -mt-3">
			<span class="text-sm text-gray-400 italic">Thinking</span>
			<span class="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0s" />
			<span class="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0.2s" />
			<span class="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0.4s" />
		</div>

		<UChatPrompt
			class="mt-4"
			v-model="input"
			variant="subtle"
			placeholder="Ask the Mini Agent"
			@submit="send"
		>
			<UChatPromptSubmit />
		</UChatPrompt>
	</UContainer>
</template>
