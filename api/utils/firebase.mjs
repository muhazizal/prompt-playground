import admin from 'firebase-admin'

let initialized = false
let initError = null

/** Initialize Firebase Admin app if not already initialized. */
function initFirebase() {
  if (initialized) return
  try {
    // Prefer explicit service account JSON from env
    const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (svcJson) {
      const creds = JSON.parse(svcJson)
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId: creds.project_id,
      })
    } else {
      // Fallback to application default credentials (GOOGLE_APPLICATION_CREDENTIALS)
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      })
    }
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

