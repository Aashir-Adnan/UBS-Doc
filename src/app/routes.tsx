import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './AppLayout'
import SiteGate from '../components/guards/SiteGate'
import ToolGuard from '../components/guards/ToolGuard'
import GithubCallback from '../screens/GithubCallback'
import Home from '../screens/Home'
import About from '../screens/About'
import ToolsHub from '../screens/ToolsHub'
import Notify from '../screens/Notify'
import APIBuilder from '../screens/APIBuilder'
import DatabaseTools from '../screens/DatabaseTools'
import Projects from '../screens/Projects'
import MyProjects from '../screens/MyProjects'
import Repositories from '../screens/Repositories'
import GitHub from '../screens/GitHub'
import GithubSandbox from '../screens/GithubSandbox'
import Meetings from '../screens/Meetings'
import MeetingCreate from '../screens/MeetingCreate'
import MeetingDetail from '../screens/MeetingDetail'
import TenantAdmin from '../screens/TenantAdmin'
import DocsPage from '../screens/DocsPage'
import NotFound from '../screens/NotFound'
import { flattenSidebar } from '../docs/sidebar'

// Wraps a /tools/* route element in the portal-access guard. Every /tools/*
// page goes through this except the OAuth callback below, which must render
// with no gate at all.
const T = (el: ReactNode) => <ToolGuard>{el}</ToolGuard>

// Bare /docs has no page of its own — send it to the first doc in the tree.
const DOCS_HOME = flattenSidebar()[0]

export default function AppRoutes() {
  return (
    <Routes>
      {/* OAuth callback: OUTSIDE gate and shell (Task 6) — security-critical,
          must stay reachable with no Google session and no sidebar. */}
      <Route path="/tools/github/callback" element={<GithubCallback />} />
      <Route element={<SiteGate><AppLayout /></SiteGate>}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/tools" element={T(<ToolsHub />)} />
        <Route path="/tools/database" element={T(<DatabaseTools view="upload" />)} />
        <Route path="/tools/database/mapper" element={T(<DatabaseTools view="mapper" />)} />
        <Route path="/tools/lucid" element={T(<Notify screen="lucid-sanitize" />)} />
        <Route path="/tools/notify" element={T(<Notify screen="notify" />)} />
        <Route path="/tools/apiObject" element={T(<APIBuilder />)} />
        <Route path="/tools/github" element={T(<GitHub />)} />
        {/* URL-only: no sidebar entry, no hub card (Task 13). */}
        <Route path="/tools/github-sandbox" element={T(<GithubSandbox />)} />
        {/* Meetings (Task 14): the old page's `view` local state becomes URLs.
            The bare path still lands on the list, so old bookmarks survive.
            /create is declared before /:meetingId for readability — React
            Router already ranks the static segment above the dynamic one.
            Workflow stages stay INTERNAL to WorkflowPanel, not routes. */}
        <Route path="/tools/meetingWorkflow" element={T(<Meetings />)} />
        <Route path="/tools/meetingWorkflow/create" element={T(<MeetingCreate />)} />
        <Route path="/tools/meetingWorkflow/:meetingId" element={T(<MeetingDetail />)} />
        <Route path="/tools/projects" element={T(<Projects view="grid" />)} />
        <Route path="/tools/projects/view" element={T(<Projects view="detail" />)} />
        <Route path="/tools/myProjects" element={T(<MyProjects view="grid" />)} />
        <Route path="/tools/myProjects/view" element={T(<MyProjects view="detail" />)} />
        <Route path="/tools/repos" element={T(<Repositories />)} />
        <Route path="/tools/tenantAdmin" element={T(<TenantAdmin />)} />
        {/* Docs sit behind the site gate only — no ToolGuard, matching the
            old behaviour where any signed-in Google user could read them. */}
        <Route path="/docs" element={<Navigate to={`/docs/${DOCS_HOME}`} replace />} />
        <Route path="/docs/*" element={<DocsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
