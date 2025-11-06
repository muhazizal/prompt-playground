// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: '2025-07-15',
	devtools: { enabled: false },
	pages: true,
	modules: ['@nuxt/ui'],
	css: ['@/assets/css/main.css'],
	runtimeConfig: {
		public: {
			apiBase: process.env.API_BASE || 'http://localhost:4000',
			firebase: {
				apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || '',
				authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
				projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
				storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
				messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
				appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || '',
			},
		},
	},
})
