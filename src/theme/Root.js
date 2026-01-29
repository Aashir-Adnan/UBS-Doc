import React from 'react';
import { AuthProvider } from '@site/src/components/portal/authStore';

export default function Root({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
