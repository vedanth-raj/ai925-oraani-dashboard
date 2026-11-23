const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

let firebaseApp = null;
let firebaseAuth = null;

function initFirebase() {
  if (firebaseApp) return firebaseAuth;

  const credPath = path.join(__dirname, '../config/firebase-service-account.json');
  let serviceAccount = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
      console.warn('[Firebase Auth] Failed to parse FIREBASE_SERVICE_ACCOUNT env:', err.message);
    }
  }

  if (!serviceAccount && fs.existsSync(credPath)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    } catch (err) {
      console.warn('[Firebase Auth] Failed to read service account JSON:', err.message);
    }
  }

  try {
    const apps = getApps();
    if (apps.length > 0) {
      firebaseApp = apps[0];
    } else if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log('[Firebase Auth] Firebase Admin SDK initialized with service account for:', serviceAccount.project_id);
    } else {
      firebaseApp = initializeApp({
        projectId: 'ai925-app'
      });
      console.log('[Firebase Auth] Firebase Admin SDK initialized with project ID: ai925-app');
    }

    firebaseAuth = getAuth(firebaseApp);
    return firebaseAuth;
  } catch (err) {
    console.error('[Firebase Auth] Failed to initialize Firebase Admin SDK:', err.message);
    return null;
  }
}

/**
 * Verify a client-provided Firebase ID Token
 * @param {string} idToken
 * @returns {Promise<{valid: boolean, phone?: string, email?: string, uid?: string, name?: string, error?: string}>}
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
