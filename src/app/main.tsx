import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as ReduxProvider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { env, installLegacyGlobals } from './env'
import '../styles/design.css'
import '../styles/tokens.css'
import '../styles/portal-compat.css'
import '../styles/docs.css'

installLegacyGlobals(env)

// Wraps window.fetch so every backend call carries the access token, adopts
// rolled tokens, and reports a 401 as an expired session. Installed here, before
// the dynamic imports below, so it is in place ahead of the first API call
// (App.tsx dispatches loadRuntimeKeys on mount). Imported dynamically for the
// same reason as the rest: it reads window.__API_BASE_URL__ at module scope.
const { installApiAuth } = await import('../services/apiAuth')
installApiAuth()

// Imported AFTER globals exist — these modules read window.__*__ at module scope.
const { store } = await import('../state/store')
const { AuthProvider } = await import('../components/portal/authStore')
const { ThemeProvider } = await import('./ThemeContext')
const { default: App } = await import('./App')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReduxProvider store={store}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter><App /></BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </ReduxProvider>
  </React.StrictMode>,
)
