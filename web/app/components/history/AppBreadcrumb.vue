<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

/**
 * AppBreadcrumb wraps Nuxt UI UBreadcrumb with standard props.
 */
defineProps<{ items: BreadcrumbItem[] }>()
</script>

<template>
  <UBreadcrumb :items="items" />
  <!-- Optional separator customization example:
  <UBreadcrumb separator-icon="i-lucide-chevron-right" :items="items" />
  -->
</template>

