// reactapp/src/pages/Dashboard.tsx
// ==================================
// Main landing page — the entry point for the playground.
// Shows stats, live service links, recent realms and users.

import { NavLink } from "react-router-dom";
import { useRealms, useUsers, type Realm, type User } from "../hooks/useApi";
import {
  Globe, Users, CheckSquare, ExternalLink, ArrowRight,
  Shield, Cloud, Server, Code2, Cpu,
} from "lucide-react";

// ── Service definitions ───────────────────────────────────────────────────────

const BASE = window.location.hostname;

const SERVICES = [
  {
    name: "Streamlit UI",
    desc: "Python data & ML dashboard",
    icon: "🐍",
    port: 8504,
    href: `http://${BASE}:8504`,
    color: "#ff4b4b",
    colorLight: "#fff0f0",
    colorDark: "#3b0000",
    tag: "Python",
  },
  {
    name: "F# API",
    desc: "ASP.NET Core minimal API",
    icon: "🔷",
    port: 8508,
    href: `http://${BASE}:8508`,
    color: "#7b2df8",
    colorLight: "#f3eeff",
    colorDark: "#1e0052",
    tag: "F#",
  },
  {
    name: "Python REST",
    desc: "FastAPI + gRPC server",
    icon: "⚡",
    port: 8505,
    href: `http://${BASE}:8505/docs`,
    color: "#009688",
    colorLight: "#e0f7f4",
    colorDark: "#002924",
    tag: "FastAPI",
  },
  {
    name: "Go API",
    desc: "Gin + NATS + PostgreSQL",
    icon: "🐹",
    port: 8500,
    href: `http://${BASE}:8500`,
    color: "#00acd7",
    colorLight: "#e0f8ff",
    colorDark: "#00222c",
    tag: "Go",
  },
  {
    name: "Rust pgctl",
    desc: "HTTP + UDP + gRPC server",
    icon: "🦀",
    port: 8502,
    href: `http://${BASE}:8502`,
    color: "#d04d00",
    colorLight: "#fff2eb",
    colorDark: "#2c0d00",
    tag: "Rust",
  },
  {
    name: "TypeScript tRPC",
    desc: "tRPC + WebSocket server",
    icon: "🟦",
    port: 8506,
    href: `http://${BASE}:8506`,
    color: "#3178c6",
    colorLight: "#e8f0fb",
    colorDark: "#0a1c3d",
    tag: "TS",
  },
];

// ── Realm type icon map ───────────────────────────────────────────────────────

function RealmTypeIcon({ type }: { type: Realm["type"] }) {
  const map = {
    AD:         <Shield size={15} />,
    Azure:      <Cloud size={15} />,
    AWS:        <Cloud size={15} />,
    LDAP:       <Server size={15} />,
    UserShared: <Users size={15} />,
  };
  return <>{map[type]}</>;
}

// ── Dashboard Component ───────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: realms, isLoading: loadingRealms } = useRealms();
  const { data: users, isLoading: loadingUsers } = useUsers();

  const recentRealms = realms?.slice(0, 6) ?? [];
  const recentUsers  = users?.slice(0, 5) ?? [];

  return (
    <div className="dashboard">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="dashboard-hero">
        <div className="hero-content">
          <div className="hero-tag">
            <Code2 size={11} />
            Polyglot Playground
          </div>
          <h1 className="hero-title">
            Welcome to <span>Playground</span>
          </h1>
          <p className="hero-subtitle">
            A multi-language development environment running Go, Rust, Python, TypeScript,
            F#, and React — all wired together with NATS, gRPC, and PostgreSQL.
          </p>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon purple">
            <Globe size={20} />
          </div>
          <div>
            <div className="stat-number">
              {loadingRealms ? "—" : (realms?.length ?? 0)}
            </div>
            <div className="stat-label">Realms</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <Users size={20} />
          </div>
          <div>
            <div className="stat-number">
              {loadingUsers ? "—" : (users?.length ?? 0)}
            </div>
            <div className="stat-label">Users</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <CheckSquare size={20} />
          </div>
          <div>
            <div className="stat-number">6</div>
            <div className="stat-label">Services</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <Cpu size={20} />
          </div>
          <div>
            <div className="stat-number">
              {loadingRealms || loadingUsers
                ? "—"
                : (realms?.reduce((s, r) => s + r.userCount, 0) ?? 0)}
            </div>
            <div className="stat-label">Realm Members</div>
          </div>
        </div>
      </div>

      {/* ── Service Links ─────────────────────────────────────────────────── */}
      <div className="section-header">
        <h2 className="section-title">Services</h2>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Click to open in a new tab
        </span>
      </div>

      <div className="services-grid">
        {SERVICES.map((svc) => (
          <a
            key={svc.name}
            href={svc.href}
            target="_blank"
            rel="noopener noreferrer"
            className="service-card"
            style={{
              "--service-color": svc.color,
              "--service-color-light": svc.colorLight,
            } as React.CSSProperties}
          >
            <div
              className="service-card-icon"
              style={{ background: svc.colorLight, fontSize: 22 }}
            >
              {svc.icon}
            </div>

            <div className="service-card-body">
              <div className="service-card-name">{svc.name}</div>
              <div className="service-card-desc">{svc.desc}</div>
            </div>

            <div className="service-card-footer">
              <span className="service-port">:{svc.port}</span>
              <span className="service-status">Live</span>
            </div>

            <ExternalLink
              size={12}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                color: "var(--text-muted)",
                opacity: 0,
                transition: "opacity 150ms",
              }}
              className="service-ext-icon"
            />
          </a>
        ))}
      </div>

      {/* ── Two column: Realms + Users ─────────────────────────────────────── */}
      <div className="two-col-grid">

        {/* Realms */}
        <div>
          <div className="section-header">
            <h2 className="section-title">Recent Realms</h2>
            <NavLink to="/realms" className="section-link">
              View all <ArrowRight size={13} />
            </NavLink>
          </div>

          {loadingRealms ? (
            <div className="page-loading" style={{ padding: "40px" }}>
              <div className="spinner" />
            </div>
          ) : recentRealms.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px" }}>
              <Globe size={36} />
              <p>No realms yet</p>
              <NavLink to="/realms" className="btn-primary" style={{ marginTop: 8 }}>
                Create a realm
              </NavLink>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recentRealms.map((realm) => (
                <RealmRow key={realm.id} realm={realm} />
              ))}
            </div>
          )}
        </div>

        {/* Users */}
        <div>
          <div className="section-header">
            <h2 className="section-title">Recent Users</h2>
            <NavLink to="/users" className="section-link">
              View all <ArrowRight size={13} />
            </NavLink>
          </div>

          {loadingUsers ? (
            <div className="page-loading" style={{ padding: "40px" }}>
              <div className="spinner" />
            </div>
          ) : recentUsers.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px" }}>
              <Users size={36} />
              <p>No users yet</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentUsers.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RealmRow({ realm }: { realm: Realm }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "12px 14px",
      transition: "box-shadow 150ms ease, transform 150ms ease",
    }}
    className="realm-row-item"
    >
      <div className="realm-type-icon" style={{ width: 34, height: 34, flexShrink: 0 }}>
        <RealmTypeIcon type={realm.type} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {realm.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          {realm.userCount} users · {realm.appCount} apps
        </div>
      </div>
      <span className={`realm-badge realm-badge--${realm.type.toLowerCase()}`}>
        {realm.type}
      </span>
      {realm.active && <span className="realm-active-dot" title="Active" />}
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 11,
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "10px 14px",
    }}>
      <div className="user-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
        {user.username[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {user.username}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {user.email}
        </div>
      </div>
      <span className={`role-badge role-badge--${user.role.toLowerCase()}`}>
        {user.role}
      </span>
    </div>
  );
}
