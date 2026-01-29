/**
 * Portal API base URL - injected at build time via plugin, fallback for dev.
 */
export const API_BASE_URL =
  (typeof window !== 'undefined' && window.__API_BASE_URL__) ||
  process.env.VITE_API_BASE_URL ||
  'http://localhost:3000';
