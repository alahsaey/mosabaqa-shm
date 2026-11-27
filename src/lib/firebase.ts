import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const runtimeApiKey =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FIREBASE_API_KEY?.trim()) ||
  firebaseConfig.apiKey;

const effectiveFirebaseConfig = {
  ...firebaseConfig,
  apiKey: runtimeApiKey,
};

const app = initializeApp(effectiveFirebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Non-blocking Firestore connectivity check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.info('Firebase Firestore is running in offline mode.');
    }
  }
}

testConnection();
