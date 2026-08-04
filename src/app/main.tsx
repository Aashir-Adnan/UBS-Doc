import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as ReduxProvider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { env, installLegacyGlobals } from './env'
import '../styles/design.css'
import '../styles/tokens.css'
import '../styles/portal-compat.css'

installLegacyGlobals(env)

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
