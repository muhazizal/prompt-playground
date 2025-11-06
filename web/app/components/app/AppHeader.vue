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
	{
		label: 'Mini Agent',
		to: '/agent',
		active: route.path.includes('/agent'),
	},
])
</script>

<template>
	<UHeader :toggle="false">
		<template #title> AI Lab </template>

		<template #right>
			<UNavigationMenu :items="items" class="-mx-2.5" />
			<UTooltip text="Open on GitHub" :kbds="['meta', 'G']" class="ml-10">
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
	</UHeader>
</template>
