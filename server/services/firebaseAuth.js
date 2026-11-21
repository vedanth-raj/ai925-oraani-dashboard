const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

let firebaseApp = null;
let firebaseAuth = null;

function initFirebase() {
  if (firebaseApp) return firebaseAuth;

  const credPath = path.join(__dirname, '../config/firebase-service-account.json');
  if (!fs.existsSync(credPath)) {
    console.warn('[Firebase Auth] Service account JSON not found at:', credPath);
    return null;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    if (!serviceAccount.project_id || !serviceAccount.private_key) {
      console.warn('[Firebase Auth] Incomplete service account credentials');
      return null;
    }

    const apps = getApps();
    firebaseApp = apps.length > 0 ? apps[0] : initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    });

    firebaseAuth = getAuth(firebaseApp);
    console.log('[Firebase Auth] Firebase Admin SDK initialized for project:', serviceAccount.project_id);
    return firebaseAuth;
  } catch (err) {
    console.error('[Firebase Auth] Failed to initialize Firebase Admin SDK:', err.message);
    return null;
  }
}

/**
 * Verify a client-provided Firebase ID Token
 * @param {string} idToken
 * @returns {Promise<{valid: boolean, phone?: string, email?: string, uid?: string, error?: string}>}
 */
async function verifyFirebaseToken(idToken) {
  const auth = initFirebase();
  if (!auth) {
    return { valid: false, error: 'Firebase Admin is not configured on the server' };
  }

  try {
    const decoded = await auth.verifyIdToken(idToken);
    const rawPhone = decoded.phone_number || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);

    return {
      valid: true,
      uid: decoded.uid,
      phone: cleanPhone || null,
      email: decoded.email || null,
      name: decoded.name || null
    };
  } catch (err) {
    console.error('[Firebase Auth] Token verification failed:', err.message);
    return { valid: false, error: err.message || 'Invalid or expired Firebase token' };
  }
}

module.exports = {
  initFirebase,
  verifyFirebaseToken
};
