<script setup lang="ts">
// Landing page for Prompt Playground and Notes Assistant
const cards = [
	{
		title: 'Prompt Playground',
		description: 'Experiment across tasks: text, vision, STT, TTS, and image generation.',
		to: '/prompt',
		icon: 'i-heroicons-command-line',
		action: 'Open Playground',
	},
	{
		title: 'Notes Assistant',
		description: 'Summarize notes with streaming and browse history with pagination.',
		to: '/notes',
		icon: 'i-heroicons-document-text',
		action: 'Open Notes',
	},
]
</script>

<template>
	<UContainer class="py-12">
		<div class="text-center mb-10">
			<h1 class="text-3xl font-semibold">AI Lab</h1>
			<p class="text-gray-700 mt-2">
				Explore LLM tasks, compare outputs, and manage summaries — all in one app.
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<UCard v-for="c in cards" :key="c.title" class="flex flex-col">
				<div class="flex items-start gap-3">
					<div>
						<h2 class="text-xl font-medium">{{ c.title }}</h2>
						<p class="text-sm text-gray-600">{{ c.description }}</p>
					</div>
				</div>
				<div class="mt-6">
					<ULink :to="c.to">
						<UButton color="primary" :icon="c.icon">{{ c.action }}</UButton>
					</ULink>
				</div>
			</UCard>
		</div>

		<UCard class="mt-10">
			<div class="grid md:grid-cols-3 gap-6">
				<div>
					<strong>Features</strong>
					<ul class="text-sm text-gray-700 mt-2 space-y-1">
						<li>• Compare prompt outputs and temperatures.</li>
						<li>• Stream results for real-time feedback.</li>
						<li>• Save and paginate history in Firestore.</li>
					</ul>
				</div>
				<div>
					<strong>Pages</strong>
					<ul class="text-sm text-gray-700 mt-2 space-y-1">
						<li>
							<ULink to="/prompt/history" class="text-primary-600">Prompt History</ULink>
						</li>
						<li>
							<ULink to="/notes/history" class="text-primary-600">Notes History</ULink>
						</li>
					</ul>
				</div>
				<div>
					<strong>Getting Started</strong>
					<p class="text-sm text-gray-700 mt-2">
						Head to the playground and try a prompt. Visit history pages to review saved outputs.
					</p>
				</div>
			</div>
		</UCard>
	</UContainer>
</template>
