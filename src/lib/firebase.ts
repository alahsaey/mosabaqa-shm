import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/**
 * Robust Google Sign-In wrapper with clean error management
 */
export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      console.info("Google Sign-In popup closed or cancelled by user.");
      throw error;
    }
    console.warn("Google Sign-In Notice:", error?.code || error);
    throw error;
  }
};

/**
 * Translate Firebase Auth error codes into helpful Arabic messages
 */
export const getAuthErrorMessage = (error: any): string => {
  if (!error) return "حدث خطأ غير متوقع أثناء تسجيل الدخول.";
  
  const code = typeof error === 'string' ? error : error?.code || '';

  if (code.startsWith('auth/api-key-not-valid')) {
    return "مفتاح Firebase API غير صالح أو تم تعطيله. يرجى تحديث المتغير VITE_FIREBASE_API_KEY في إعدادات الاستضافة بمفتاح صالح من Firebase Console.";
  }

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return "تم إغلاق نافذة تسجيل الدخول قبل استكمال الإجراء.";
    case 'auth/popup-blocked':
      return "تم حظر النافذة المنبثقة من قبل المتصفح. يرجى تفعيل النوافذ المنبثقة لموقع المسابقة وإعادة المحاولة.";
    case 'auth/unauthorized-domain':
      return "هذا النطاق غير مضاف في قائمة النطاقات المصرح بها (Authorized Domains) في إعدادات Firebase Console.";
    case 'auth/operation-not-allowed':
      return "مزود الدخول عبر Google غير مفعل في إعدادات مشروع Firebase.";
    case 'auth/network-request-failed':
      return "فشل الاتصال بالشبكة. يرجى التأكد من جودة الاتصال بالإنترنت والمحاولة مجدداً.";
    case 'auth/account-exists-with-different-credential':
      return "يوجد حساب سابق بنفس البريد الإلكتروني مع ربط مختلف.";
    default:
      return error?.message || "تعذر إكمال تسجيل الدخول عبر Google. يرجى المحاولة لاحقاً.";
  }
};

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.info("Firebase Firestore is in offline mode.");
    }
  }
}
testConnection();
