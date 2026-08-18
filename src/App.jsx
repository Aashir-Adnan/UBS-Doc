import { Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import DynamicMarkdown from "./components/DynamicMarkdown";

// Tool Pages
import Tools from "./pages/tools";
import ApiObject from "./pages/tools/apiObject";
import Database from "./pages/tools/database";
import Github from "./pages/tools/github";
import GithubSandbox from "./pages/tools/github-sandbox";
import Lucid from "./pages/tools/lucid";
import MeetingWorkflow from "./pages/tools/meetingWorkflow";
import MyProjects from "./pages/tools/myProjects";
import Notify from "./pages/tools/notify";
import Repos from "./pages/tools/repos";
import TenantAdmin from "./pages/tools/tenantAdmin";
import AuthRoot from "./components/portal/AuthRoot";
import AppLayout from "./layouts/AppLayout";
//import AuthGate from "./components/portal/AuthGate";

// Nested Tool Pages
import DatabaseMapper from "./pages/tools/database/mapper";

import ProjectIndex from "./pages/tools/projects";
import ProjectView from "./pages/tools/projects/view";

import MyProjectView from "./pages/tools/myProjects/view";

function App() {
  return (
    <AuthRoot>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Home */}
          <Route path="/" element={<Home />} />

          {/* Dynamic Documentation */}
          <Route path="/docs/*" element={<DynamicMarkdown />} />

          {/* Tools */}
          <Route path="/tools" element={<Tools />} />
          <Route path="/tools/apiObject" element={<ApiObject />} />
          <Route path="/tools/database" element={<Database />} />
          <Route path="/tools/database/mapper" element={<DatabaseMapper />} />
          <Route path="/tools/github" element={<Github />} />
          <Route path="/tools/github-sandbox" element={<GithubSandbox />} />
          <Route path="/tools/lucid" element={<Lucid />} />
          <Route path="/tools/meetingWorkflow" element={<MeetingWorkflow />} />
          <Route path="/tools/myProjects" element={<MyProjects />} />
          <Route path="/tools/myProjects/view" element={<MyProjectView />} />
          <Route path="/tools/notify" element={<Notify />} />
          <Route path="/tools/repos" element={<Repos />} />
          <Route path="/tools/tenantAdmin" element={<TenantAdmin />} />

          {/* Projects */}
          <Route path="/tools/projects" element={<ProjectIndex />} />
          <Route path="/tools/projects/view" element={<ProjectView />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<h1>404 - Page Not Found</h1>} />
      </Routes>
    </AuthRoot>
  );
}

export default App;
