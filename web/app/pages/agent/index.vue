<script setup lang="ts">
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import AgentSidebar from '@/components/agent/AgentSidebar.vue'
import { useAgent } from '@/composables/useAgent'
import { useAgentSessions } from '@/composables/useAgentSessions'

const currentSessionId = ref<string | null>(null)
const { createSession } = useAgentSessions()
const { messages, status, input, send, preloadHistory } = useAgent()

const isLoading = computed(() => status.value === 'submitted' || status.value === 'streaming')
const justCompleted = ref(false)

watch(status, (s, prev) => {
	if (prev !== 'ready' && s === 'ready') {
		justCompleted.value = true
		setTimeout(() => (justCompleted.value = false), 800)
	}
})

// Reload history when switching sessions
watch(currentSessionId, async (sid) => {
	if (sid) await preloadHistory(sid, 100)
})

async function handleSubmit() {
	// Create a session on the first chat
	if (!currentSessionId.value) {
		const created = await createSession('New Chat')
		if (created?.id) currentSessionId.value = created.id
	}
	await send(currentSessionId.value || '')
}
</script>

<template>
	<div class="flex h-[calc(100vh-64px)]">
		<AgentSidebar
			:selected-id="currentSessionId || undefined"
			@select="(id) => (currentSessionId = id)"
		/>

		<div class="flex-1">
			<UContainer class="py-8 h-full flex flex-col justify-end max-w-[900px]">
				<UChatMessages
					:messages="messages"
					:status="status"
					should-auto-scroll
					style="height: calc(100vh - 144px)"
					class="overflow-auto"
				>
					<template #content="{ message }">
						<div class="*:first:mt-0 *:last:mb-0 transition-transform duration-300">
							{{ getTextFromMessage(message) }}
						</div>
					</template>
				</UChatMessages>

				<div v-if="isLoading" class="flex items-center gap-2 px-2.5 pb-3 -mt-3">
					<span class="text-sm text-gray-400 italic">Thinking</span>
					<span
						class="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
						style="animation-delay: 0s"
					/>
					<span
						class="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
						style="animation-delay: 0.2s"
					/>
					<span
						class="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
						style="animation-delay: 0.4s"
					/>
				</div>

				<UChatPrompt
					v-model="input"
					variant="subtle"
					placeholder="Ask the Mini Agent"
					@submit="handleSubmit"
				>
					<UChatPromptSubmit />
				</UChatPrompt>
			</UContainer>
		</div>
	</div>
</template>
