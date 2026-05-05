import { useEffect } from 'react';
import { AuthProvider } from './authStore';
import { initFirebase } from './firebase';
import { loadRuntimeKeys } from '@site/src/state/runtimeKeysSlice';
import { store } from '@site/src/state/store';

function toFirebaseConfig(runtimeKeys = {}) {
  const fallback = (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) || {};
  return {
    apiKey: runtimeKeys.FIREBASE_API_KEY || fallback.apiKey || '',
    authDomain: runtimeKeys.FIREBASE_AUTH_DOMAIN || fallback.authDomain || '',
    projectId: runtimeKeys.FIREBASE_PROJECT_ID || fallback.projectId || '',
    storageBucket: runtimeKeys.FIREBASE_STORAGE_BUCKET || fallback.storageBucket || '',
    messagingSenderId:
      runtimeKeys.FIREBASE_MESSAGING_SENDER_ID || fallback.messagingSenderId || '',
    appId: runtimeKeys.FIREBASE_APP_ID || fallback.appId || '',
    measurementId: runtimeKeys.FIREBASE_MEASUREMENT_ID || fallback.measurementId || '',
  };
}

export default function AuthRoot({ children }) {
  useEffect(() => {
    store.dispatch(loadRuntimeKeys());
  }, []);

  useEffect(() => {
    initFirebase(toFirebaseConfig(store.getState().runtimeKeys.keys));
    const unsubscribe = store.subscribe(() => {
      const { keys } = store.getState().runtimeKeys;
      initFirebase(toFirebaseConfig(keys));
    });
    return unsubscribe;
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
