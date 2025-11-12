<script setup lang="ts">
import type { AgentSession } from '@/composables/useAgentSessions'
import { useAgentSessions } from '@/composables/useAgentSessions'

const emit = defineEmits<{ (e: 'select', id: string): void }>()
const props = defineProps<{ selectedId?: string }>()

const { listSessions, createSession, renameSession, deleteSession } = useAgentSessions()
const sessions = ref<AgentSession[]>([])
const loading = ref(true)
const editingId = ref<string | null>(null)
const editingTitle = ref('')
const showDeleteConfirm = ref(false)
const deleteTargetId = ref<string | null>(null)
const deleteTargetTitle = ref<string>('')

async function refresh() {
	loading.value = true
	sessions.value = await listSessions(100)
	loading.value = false
	// Auto-select the first session on initial load when none is selected
	if (sessions.value.length && !props.selectedId) {
		emit('select', sessions.value[0]!.id)
	}
}

async function newChat() {
	const created = await createSession('New Chat')
	if (created && typeof created.id === 'string') {
		// Optimistic: add to local list at top
		const newItem: AgentSession = {
			id: created.id,
			title: created.title || 'Untitled',
			updatedAt: created.updatedAt,
			status: 'active',
		}
		sessions.value.unshift(newItem)
		emit('select', newItem.id)
	}
}

function startRename(s: AgentSession) {
	editingId.value = s.id
	editingTitle.value = s.title
}

async function submitRename() {
	if (!editingId.value) return
	const ok = await renameSession(editingId.value, editingTitle.value.trim() || 'Untitled')
	if (ok) {
		// Optimistic: update local title
		const i = sessions.value.findIndex((s) => s.id === editingId.value)
		if (i >= 0)
			sessions.value[i] = {
				...sessions.value[i],
				title: editingTitle.value.trim() || 'Untitled',
				id: sessions.value[i]!.id,
			}
		editingId.value = null
		editingTitle.value = ''
	}
}

function cancelRename() {
	editingId.value = null
	editingTitle.value = ''
}

function promptDelete(s: AgentSession) {
	deleteTargetId.value = s.id
	deleteTargetTitle.value = s.title
	showDeleteConfirm.value = true
}

async function confirmDelete() {
	if (!deleteTargetId.value) return
	const id = deleteTargetId.value
	const ok = await deleteSession(id)
	showDeleteConfirm.value = false
	deleteTargetId.value = null
	if (ok) {
		// Optimistic: remove from local list
		const idx = sessions.value.findIndex((x) => x.id === id)
		if (idx >= 0) sessions.value.splice(idx, 1)
		// Auto-select next session if current selection was deleted
		if (id === (typeof props.selectedId === 'string' ? props.selectedId : undefined)) {
			const next = sessions.value[idx] || sessions.value[idx - 1]
			emit('select', next?.id || '')
		}
	}
}

function cancelDelete() {
	showDeleteConfirm.value = false
	deleteTargetId.value = null
}

onMounted(refresh)
</script>

<template>
	<aside class="w-64 border-r border-gray-200 bg-white h-full flex flex-col">
		<div class="p-3 border-b border-gray-200 flex items-center justify-between">
			<h2 class="text-base font-semibold">Chat</h2>
			<UButton size="xs" color="primary" variant="soft" icon="i-heroicons-plus" @click="newChat">
				New
			</UButton>
		</div>
		<div class="flex-1 overflow-y-auto">
			<div v-if="loading" class="p-3 text-gray-500 text-sm">Loading…</div>
			<ul v-else>
				<li v-for="s in sessions" :key="s.id" class="group">
					<div
						class="w-full px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
						:class="selectedId === s.id ? 'bg-gray-100' : ''"
					>
						<!-- Title or inline editor -->
						<button
							v-if="editingId !== s.id"
							class="flex-1 text-left"
							@click="emit('select', s.id)"
						>
							<span class="text-sm">{{ s.title }}</span>
						</button>
						<div v-else class="flex-1 flex items-center gap-2">
							<UInput v-model="editingTitle" size="xs" placeholder="Session title" />
							<UButton size="xs" color="primary" variant="soft" @click="submitRename">Save</UButton>
							<UButton size="xs" color="neutral" variant="ghost" @click="cancelRename"
								>Cancel</UButton
							>
						</div>

						<!-- Actions -->
						<div
							v-if="editingId !== s.id"
							class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<UButton
								icon="i-heroicons-pencil"
								color="neutral"
								variant="ghost"
								size="xs"
								@click="startRename(s)"
							/>
							<UButton
								icon="i-heroicons-trash"
								color="error"
								variant="ghost"
								size="xs"
								@click="promptDelete(s)"
							/>
						</div>
					</div>
				</li>
				<li v-if="sessions.length === 0" class="p-3 text-gray-500 text-sm">No chat history yet.</li>
			</ul>
		</div>
	</aside>

	<!-- Delete confirmation modal -->
	<UModal
		v-model:open="showDeleteConfirm"
		title="Delete session"
		description="Are you sure you want to delete this session? This action cannot be undone."
	>
		<template #content>
			<UCard>
				<template #header>
					<div class="flex items-center gap-2">
						<UIcon name="i-heroicons-exclamation-triangle" class="text-error" />
						<span class="font-semibold">Delete session</span>
					</div>
				</template>
				<p class="text-sm">
					Are you sure you want to delete "{{ deleteTargetTitle }}"? This action cannot be undone.
				</p>
				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="neutral" variant="ghost" @click="cancelDelete">Cancel</UButton>
						<UButton color="error" variant="solid" @click="confirmDelete">Delete</UButton>
					</div>
				</template>
			</UCard>
		</template>
	</UModal>
</template>
