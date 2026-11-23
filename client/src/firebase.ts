import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyAkieCEueqhHt76a6rDVg90eulE-9BzQxg",
  authDomain: "ai925-app.firebaseapp.com",
  projectId: "ai925-app",
  storageBucket: "ai925-app.firebasestorage.app",
  messagingSenderId: "815398785901",
  appId: "1:815398785901:web:25d04ca0f42ec14cf78064"
};

const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Clean up any previous reCAPTCHA verifier and replace container DOM node with a brand fresh one
export function resetRecaptcha(containerId: string = 'firebase-recaptcha-container') {
  if ((window as any).recaptchaVerifier) {
    try {
      (window as any).recaptchaVerifier.clear();
    } catch {}
    delete (window as any).recaptchaVerifier;
  }
  const oldEl = document.getElementById(containerId);
  if (oldEl && oldEl.parentNode) {
    const freshEl = document.createElement('div');
    freshEl.id = containerId;
    oldEl.parentNode.replaceChild(freshEl, oldEl);
  }
}

// Get existing verifier or create a fresh one on a clean DOM node
export function setupRecaptcha(containerId: string = 'firebase-recaptcha-container', onSolved?: () => void): RecaptchaVerifier {
  // If an existing verifier is on window and element exists, reuse it
  if ((window as any).recaptchaVerifier && document.getElementById(containerId)) {
    return (window as any).recaptchaVerifier;
  }

  // Ensure fresh pristine DOM container
  resetRecaptcha(containerId);

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      if (onSolved) onSolved();
    },
    'expired-callback': () => {
      console.warn('[Firebase Auth] reCAPTCHA expired, resetting...');
      resetRecaptcha(containerId);
    }
  });

  (window as any).recaptchaVerifier = verifier;
  return verifier;
}

// Send SMS verification code to an Indian / international mobile number
export async function sendFirebasePhoneOtp(mobile: string, appVerifier?: RecaptchaVerifier): Promise<ConfirmationResult> {
  const clean = mobile.replace(/\D/g, '').slice(-10);
  const formattedPhone = `+91${clean}`;
  const verifier = appVerifier || setupRecaptcha('firebase-recaptcha-container');

  try {
    return await signInWithPhoneNumber(auth, formattedPhone, verifier);
  } catch (err: any) {
    // If reCAPTCHA was already rendered or failed, reset DOM container and retry once automatically
    if (err?.message?.includes('already been rendered') || err?.code === 'auth/captcha-check-failed') {
      console.warn('[Firebase Auth] Resetting reCAPTCHA and retrying dispatch...');
      resetRecaptcha('firebase-recaptcha-container');
      const freshVerifier = setupRecaptcha('firebase-recaptcha-container');
      return await signInWithPhoneNumber(auth, formattedPhone, freshVerifier);
    }
    throw err;
  }
}
export type { ConfirmationResult };
