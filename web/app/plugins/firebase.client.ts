import { initializeApp } from 'firebase/app'
import type { FirebaseOptions } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

function isFirebaseOptions(x: unknown): x is FirebaseOptions {
	return !!x && typeof (x as any).apiKey === 'string'
}

export default defineNuxtPlugin(async (nuxtApp) => {
	const { public: pub } = useRuntimeConfig()
	const cfgUnknown = (await (pub as any)?.firebase) as unknown

	console.log('[firebase] Initializing...')

	if (!isFirebaseOptions(cfgUnknown)) {
		console.warn('[firebase] Missing public firebase config, skipping init')
		return
	}

	const app = initializeApp(cfgUnknown)
	const auth = getAuth(app)

	try {
		await signInAnonymously(auth)
		console.log('[firebase] Anonymous auth success')
	} catch (e: unknown) {
		const msg = typeof e === 'object' && e && 'message' in e ? (e as any).message : String(e)
		console.warn('[firebase] Anonymous auth failed:', msg)
	}

	const db = getFirestore(app)
	console.log('[firebase] Firestore initialized')

	nuxtApp.provide('db', db)
	nuxtApp.provide('auth', auth)
})
