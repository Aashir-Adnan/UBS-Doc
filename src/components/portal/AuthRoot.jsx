import { useEffect } from 'react';
import { AuthProvider } from './authStore';
import { initFirebase } from './firebase';

export default function AuthRoot({ children }) {
  useEffect(() => {
    initFirebase();
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
