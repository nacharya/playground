/**
 * reactapp/src/store/appStore.ts — Zustand Global State
 * =======================================================
 *
 * Zustand is a minimal state management library. Unlike Redux, there's no
 * boilerplate — just a single `create()` call that returns a hook.
 *
 * When to use Zustand vs React Query:
 *   React Query → server state (data from APIs: users, realms, tasks)
 *   Zustand     → client-only UI state (theme, sidebar, auth session, notifications)
 *
 * Patterns demonstrated:
 *   1. Slice pattern: separate logical domains in one store
 *   2. Immer middleware: write "mutating" code that's actually immutable
 *   3. DevTools middleware: Redux DevTools browser extension
 *   4. Persist middleware: survives page refresh via localStorage
 *
 * Usage in components:
 *   const theme = useAppStore(state => state.theme);
 *   const toggleTheme = useAppStore(state => state.toggleTheme);
 */

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  timestamp: number;
  autoDismissMs?: number;
}

interface CurrentUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "Admin" | "Contributor" | "ReadOnly";
}

// ─────────────────────────────────────────────────────────────────────────────
// Store shape
// ─────────────────────────────────────────────────────────────────────────────

interface AppState {
  // ── UI slice ──────────────────────────────────────────────────────────────
  theme: "light" | "dark";
  sidebarOpen: boolean;
  activeRealmId: string | null;

  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveRealm: (realmId: string | null) => void;

  // ── Auth slice ────────────────────────────────────────────────────────────
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;

  login: (user: CurrentUser) => void;
  logout: () => void;

  // ── Notification slice ────────────────────────────────────────────────────
  notifications: Notification[];

  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
  dismissNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store implementation
// ─────────────────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // ── UI slice ────────────────────────────────────────────────────────
        theme: "light",
        sidebarOpen: true,
        activeRealmId: null,

        toggleTheme: () =>
          set(
            (state) => ({ theme: state.theme === "light" ? "dark" : "light" }),
            false,
            "ui/toggleTheme"
          ),

        setTheme: (theme) => set({ theme }, false, "ui/setTheme"),

        toggleSidebar: () =>
          set(
            (state) => ({ sidebarOpen: !state.sidebarOpen }),
            false,
            "ui/toggleSidebar"
          ),

        setSidebarOpen: (open) => set({ sidebarOpen: open }, false, "ui/setSidebarOpen"),

        setActiveRealm: (realmId) =>
          set({ activeRealmId: realmId }, false, "ui/setActiveRealm"),

        // ── Auth slice ──────────────────────────────────────────────────────
        currentUser: null,
        isAuthenticated: false,

        login: (user) =>
          set(
            { currentUser: user, isAuthenticated: true },
            false,
            "auth/login"
          ),

        logout: () =>
          set(
            { currentUser: null, isAuthenticated: false },
            false,
            "auth/logout"
          ),

        // ── Notification slice ──────────────────────────────────────────────
        notifications: [],

        addNotification: (notification) =>
          set(
            (state) => ({
              notifications: [
                ...state.notifications,
                { ...notification, id: genId(), timestamp: Date.now() },
              ],
            }),
            false,
            "notifications/add"
          ),

        dismissNotification: (id) =>
          set(
            (state) => ({
              notifications: state.notifications.filter((n) => n.id !== id),
            }),
            false,
            "notifications/dismiss"
          ),

        clearAllNotifications: () =>
          set({ notifications: [] }, false, "notifications/clearAll"),
      }),
      {
        // persist middleware: save these keys to localStorage
        // Persisted: theme preference, auth session
        // NOT persisted: notifications (ephemeral), active realm (per-session)
        name: "playground-app-store",
        partialize: (state) => ({
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
          currentUser: state.currentUser,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    { name: "PlaygroundApp" } // DevTools display name
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors — memoized state slices
// ─────────────────────────────────────────────────────────────────────────────
// Using selectors prevents unnecessary re-renders:
// instead of subscribing to the whole store, components subscribe to a slice.
//
// Good:    const theme = useAppStore(selectTheme)   ← re-renders only when theme changes
// Bad:     const store = useAppStore()               ← re-renders on ANY store change

export const selectTheme          = (s: AppState) => s.theme;
export const selectSidebarOpen    = (s: AppState) => s.sidebarOpen;
export const selectCurrentUser    = (s: AppState) => s.currentUser;
export const selectIsAuthenticated = (s: AppState) => s.isAuthenticated;
export const selectNotifications  = (s: AppState) => s.notifications;
export const selectActiveRealmId  = (s: AppState) => s.activeRealmId;
