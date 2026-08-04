import { c, muted, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import GithubWorkflowSandbox from '../components/portal/GithubWorkflowSandbox'

// Ported from src/pages/tools/github-sandbox.jsx (pre-migration): the same
// SandboxContent body and the same hardcoded SANDBOX_USER, with the old
// @theme/Layout wrapper swapped for the design's aurora/breadcrumb chrome.
// GithubWorkflowSandbox itself is untouched — it drives the whole mock GitHub
// workflow off src/components/portal/mockGithubData.js with no network, no
// PAT and no backend, so it keeps its own tab bar rather than the design shell
// that src/screens/GitHub.tsx puts around the real GithubWorkflow.
//
// URL-only by design: reachable at /tools/github-sandbox behind ToolGuard,
// with no sidebar nav entry and no card on the tools hub.

const SANDBOX_USER = {
  uid: 'sandbox-001',
  email: 'intern@granjur.com',
  name: 'Sandbox User',
  photoURL: null,
}

export default function GithubSandbox() {
  const { theme } = useTheme()
  const d = theme === 'dark'

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-10 py-10">
        <Breadcrumb items={['UBS', 'Dev Tools', 'GitHub', 'Sandbox']} theme={theme} />

        <h1 className="grad-text font-extrabold" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>
          GitHub Workflow Sandbox
        </h1>
        <p className={c('text-sm font-medium mb-8', muted(theme))}>
          Browse repositories and dispatch agent tasks as GitHub issues. Signed in as{' '}
          <strong>{SANDBOX_USER.name}</strong> — sandbox mode, no real API calls.
        </p>

        <GithubWorkflowSandbox user={SANDBOX_USER} />
      </div>
    </div>
  )
}
