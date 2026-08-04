import type { ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
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

const P = ({ name }: { name: string }) => <div style={{ padding: 40 }}>{name} — coming in its task</div>

// Wraps a /tools/* route element in the portal-access guard. Every /tools/*
// page goes through this except the OAuth callback below, which must render
// with no gate at all.
const T = (el: ReactNode) => <ToolGuard>{el}</ToolGuard>

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
        <Route path="/tools/github" element={T(<P name="github" />)} />
        <Route path="/tools/github-sandbox" element={T(<P name="sandbox" />)} />
        <Route path="/tools/meetingWorkflow" element={T(<P name="meetings" />)} />
        <Route path="/tools/projects" element={T(<P name="projects" />)} />
        <Route path="/tools/projects/view" element={T(<P name="project view" />)} />
        <Route path="/tools/myProjects" element={T(<P name="my projects" />)} />
        <Route path="/tools/myProjects/view" element={T(<P name="my project view" />)} />
        <Route path="/tools/repos" element={T(<P name="repos" />)} />
        <Route path="/tools/tenantAdmin" element={T(<P name="tenant admin" />)} />
        <Route path="/docs/*" element={<P name="docs" />} />
        <Route path="*" element={<P name="404" />} />
      </Route>
    </Routes>
  )
}
