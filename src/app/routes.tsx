import { Routes, Route } from 'react-router-dom'
import AppLayout from './AppLayout'

const P = ({ name }: { name: string }) => <div style={{ padding: 40 }}>{name} — coming in its task</div>

export default function AppRoutes() {
  return (
    <Routes>
      {/* OAuth callback: OUTSIDE gate and shell (Task 6) */}
      <Route path="/tools/github/callback" element={<P name="callback" />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<P name="home" />} />
        <Route path="/about" element={<P name="about" />} />
        <Route path="/tools" element={<P name="tools hub" />} />
        <Route path="/tools/database" element={<P name="database" />} />
        <Route path="/tools/database/mapper" element={<P name="mapper" />} />
        <Route path="/tools/lucid" element={<P name="lucid" />} />
        <Route path="/tools/notify" element={<P name="notify" />} />
        <Route path="/tools/apiObject" element={<P name="api builder" />} />
        <Route path="/tools/github" element={<P name="github" />} />
        <Route path="/tools/github-sandbox" element={<P name="sandbox" />} />
        <Route path="/tools/meetingWorkflow" element={<P name="meetings" />} />
        <Route path="/tools/projects" element={<P name="projects" />} />
        <Route path="/tools/projects/view" element={<P name="project view" />} />
        <Route path="/tools/myProjects" element={<P name="my projects" />} />
        <Route path="/tools/myProjects/view" element={<P name="my project view" />} />
        <Route path="/tools/repos" element={<P name="repos" />} />
        <Route path="/tools/tenantAdmin" element={<P name="tenant admin" />} />
        <Route path="/docs/*" element={<P name="docs" />} />
        <Route path="*" element={<P name="404" />} />
      </Route>
    </Routes>
  )
}
