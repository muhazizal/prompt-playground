import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'

let initialized = false
let initError = null

/** Initialize Firebase Admin app if not already initialized. */
function initFirebase() {
	if (initialized) return
	try {
		// // 1) Base64-encoded JSON (recommended)
		// const svcBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
		// if (svcBase64) {
		// 	const decoded = Buffer.from(svcBase64, 'base64').toString('utf8')
		// 	const creds = JSON.parse(decoded)
		// 	if (typeof creds.private_key === 'string' && creds.private_key.includes('\\n')) {
		// 		creds.private_key = creds.private_key.replace(/\\n/g, '\n')
		// 	}
		// 	admin.initializeApp({
		// 		credential: admin.credential.cert(creds),
		// 		projectId: creds.project_id,
		// 	})
		// 	initialized = true
		// 	return
		// }

		// // 2) One-line JSON in env
		// const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT
		// if (svcJson) {
		// 	const creds = JSON.parse(svcJson)
		// 	if (typeof creds.private_key === 'string' && creds.private_key.includes('\\n')) {
		// 		creds.private_key = creds.private_key.replace(/\\n/g, '\n')
		// 	}
		// 	admin.initializeApp({
		// 		credential: admin.credential.cert(creds),
		// 		projectId: creds.project_id,
		// 	})
		// 	initialized = true
		// 	return
		// }

		// // 3) Separate env vars (no JSON file)
		// const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
		// const projectId = process.env.GOOGLE_PROJECT_ID
		// let privateKey = process.env.GOOGLE_PRIVATE_KEY
		// if (clientEmail && privateKey) {
		// 	if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n')
		// 	admin.initializeApp({
		// 		credential: admin.credential.cert({
		// 			client_email: clientEmail,
		// 			private_key: privateKey,
		// 			project_id: projectId,
		// 		}),
		// 		projectId,
		// 	})
		// 	initialized = true
		// 	return
		// }

		// 4) File path (CommonJS require equivalent)
		const envFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE
		const defaultFile = path.resolve(process.cwd(), 'api', 'serviceAccountKey.json')
		const filePath = envFile || (fs.existsSync(defaultFile) ? defaultFile : null)
		if (filePath) {
			const raw = fs.readFileSync(filePath, 'utf8')
			const creds = JSON.parse(raw)
			if (typeof creds.private_key === 'string' && creds.private_key.includes('\\n')) {
				creds.private_key = creds.private_key.replace(/\\n/g, '\n')
			}
			admin.initializeApp({
				credential: admin.credential.cert(creds),
				projectId: creds.project_id,
			})
			initialized = true
			return
		}

		// 5) Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS or attached runtime SA)
		admin.initializeApp({
			credential: admin.credential.applicationDefault(),
		})
		initialized = true
	} catch (err) {
		initError = err
		console.error('[firebase] init error:', err?.message || String(err))
	}
}

/** Get Firestore instance or throw if not available. */
export async function getFirestore() {
	if (!initialized && !initError) initFirebase()
	if (initError) throw initError
	return admin.firestore()
}

/** Verify Firebase ID token and return decoded claims. */
export async function verifyIdToken(idToken) {
	if (!initialized && !initError) initFirebase()
	if (initError) throw initError
	return admin.auth().verifyIdToken(idToken)
}
