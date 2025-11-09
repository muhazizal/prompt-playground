import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'

let initialized = false
let initError = null

/** Initialize Firebase Admin app if not already initialized. */
function initFirebase() {
	if (initialized) return
	try {
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
