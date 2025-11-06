<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

// navigationItems are the items in the navigation menu.
const items = computed<NavigationMenuItem[]>(() => [
	{
		label: 'Prompt Playground',
		to: '/prompt',
		active: route.path.includes('/prompt'),
	},
	{
		label: 'Notes Assistant',
		to: '/notes',
		active: route.path.includes('/notes'),
	},
])
</script>

<template>
	<UHeader>
		<template #title> AI Lab </template>

		<UNavigationMenu :items="items" />

		<template #right>
			<UTooltip text="Open on GitHub" :kbds="['meta', 'G']">
				<UButton
					color="neutral"
					variant="ghost"
					to="https://github.com/muhazizal/prompt-playground"
					target="_blank"
					icon="i-simple-icons-github"
					aria-label="GitHub"
				/>
			</UTooltip>
		</template>

		<template #body>
			<UNavigationMenu :items="items" orientation="vertical" class="-mx-2.5" />
		</template>
	</UHeader>
</template>
