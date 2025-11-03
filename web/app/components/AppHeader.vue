<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

// navigationItems are the items in the navigation menu.
const items = computed<NavigationMenuItem[]>(() => [
	{
		label: 'Prompt Playground',
		to: '/',
		active: route.path === '/',
	},
	{
		label: 'AI Notes Assistant',
		to: '/notes',
		active: route.path === '/notes',
	},
])
</script>

<template>
	<header class="w-full py-4 border-b border-b-gray-200">
		<UNavigationMenu :items="items" class="w-full justify-center" />
	</header>
</template>
