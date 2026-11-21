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

// Helper to set up invisible reCAPTCHA on a target element ID or button
export function setupRecaptcha(containerId: string, onSolved?: () => void): RecaptchaVerifier {
  // Clear any existing verifier on window if present
  if ((window as any).recaptchaVerifier) {
    try {
      (window as any).recaptchaVerifier.clear();
    } catch {}
    delete (window as any).recaptchaVerifier;
  }

  // Clear any leftover DOM nodes inside the container element
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = '';
  }

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      if (onSolved) onSolved();
    },
    'expired-callback': () => {
      console.warn('[Firebase Auth] reCAPTCHA expired, resetting...');
    }
  });

  (window as any).recaptchaVerifier = verifier;
  return verifier;
}

// Send SMS verification code to an Indian / international mobile number
export async function sendFirebasePhoneOtp(mobile: string, appVerifier: RecaptchaVerifier): Promise<ConfirmationResult> {
  const clean = mobile.replace(/\D/g, '').slice(-10);
  const formattedPhone = `+91${clean}`;
  return await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
}
