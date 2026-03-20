// reactapp/src/App.tsx
// ====================
// Root application shell — sets up routing and global layout.
// All routes are defined here; components handle their own data fetching.

import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAppStore } from "./store/appStore";
import RealmDashboard from "./components/RealmDashboard";
import TaskBoard from "./components/TaskBoard";
import UserTable from "./components/UserTable";

// Icons (lucide-react — tree-shakeable SVG icons)
import { LayoutDashboard, CheckSquare, Users, Moon, Sun, Menu } from "lucide-react";

export default function App() {
  const { theme, toggleTheme, sidebarOpen, toggleSidebar } = useAppStore(
    (s) => ({
      theme: s.theme,
      toggleTheme: s.toggleTheme,
      sidebarOpen: s.sidebarOpen,
      toggleSidebar: s.toggleSidebar,
    })
  );

  return (
    <div className={`app ${theme}`} data-theme={theme}>
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
        <div className="sidebar-header">
          <span className="logo">{sidebarOpen ? "Playground" : "P"}</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/realms" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <LayoutDashboard size={18} />
            {sidebarOpen && <span>Realms</span>}
          </NavLink>

          <NavLink to="/tasks" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <CheckSquare size={18} />
            {sidebarOpen && <span>Tasks</span>}
          </NavLink>

          <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Users size={18} />
            {sidebarOpen && <span>Users</span>}
          </NavLink>
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="main-wrapper">
        {/* Top bar */}
        <header className="topbar">
          <button className="icon-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
            <Menu size={20} />
          </button>

          <div className="topbar-actions">
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/realms" replace />} />
            <Route path="/realms" element={<RealmDashboard />} />
            <Route path="/tasks" element={<TaskBoard />} />
            <Route path="/users" element={<UserTable />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
