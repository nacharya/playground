// reactapp/src/App.tsx
// ====================
// Root application shell — top navbar + routed page content.

import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAppStore } from "./store/appStore";
import { useUsers } from "./hooks/useApi";
import RealmDashboard from "./components/RealmDashboard";
import TaskBoard from "./components/TaskBoard";
import UserTable from "./components/UserTable";
import Dashboard from "./pages/Dashboard";

import {
  LayoutDashboard, Globe, CheckSquare, Users,
  Moon, Sun,
} from "lucide-react";

// ── Service quick-links in the navbar ────────────────────────────────────────

const BASE = window.location.hostname;

const NAV_SERVICES = [
  { name: "Streamlit", href: `http://${BASE}:8504`, emoji: "🐍" },
  { name: "F# API",    href: `http://${BASE}:8508`, emoji: "🔷" },
  { name: "Rust API",  href: `http://${BASE}:8502`, emoji: "🦀" },
];

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { theme, toggleTheme } = useAppStore((s) => ({
    theme: s.theme,
    toggleTheme: s.toggleTheme,
  }));

  // Fetch first user to show in the nav bar user badge
  const { data: users } = useUsers();
  const navUser = users?.[0];

  return (
    <div className="app" data-theme={theme}>
      {/* ── Top Navbar ────────────────────────────────────────────────────── */}
      <nav className="navbar">
        {/* Brand */}
        <NavLink to="/" className="navbar-brand">
          <div className="brand-icon">🎮</div>
          Playground
        </NavLink>

        {/* Primary nav links */}
        <div className="navbar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <LayoutDashboard size={15} />
            Dashboard
          </NavLink>

          <NavLink
            to="/realms"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <Globe size={15} />
            Realms
          </NavLink>

          <NavLink
            to="/users"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <Users size={15} />
            Users
          </NavLink>

          <NavLink
            to="/tasks"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <CheckSquare size={15} />
            Tasks
          </NavLink>
        </div>

        {/* Right side: service pills + user + theme */}
        <div className="navbar-right">
          {/* Quick-access service links */}
          <div className="navbar-service-links">
            {NAV_SERVICES.map((svc) => (
              <a
                key={svc.name}
                href={svc.href}
                target="_blank"
                rel="noopener noreferrer"
                className="service-pill"
                title={`Open ${svc.name}`}
              >
                <span className="service-dot" />
                <span>{svc.emoji} {svc.name}</span>
              </a>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            className="theme-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* User badge */}
          {navUser && (
            <div className="user-badge">
              <div className="user-avatar">
                {navUser.username[0]?.toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">{navUser.username}</span>
                <span className="user-role">{navUser.role}</span>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ── Page Content ──────────────────────────────────────────────────── */}
      <div className="page-wrapper">
        <Routes>
          <Route path="/"       element={<Dashboard />} />
          <Route path="/realms" element={<RealmDashboard />} />
          <Route path="/users"  element={<UserTable />} />
          <Route path="/tasks"  element={<TaskBoard />} />
          {/* Catch-all: redirect unknown paths to home */}
          <Route path="*"       element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
