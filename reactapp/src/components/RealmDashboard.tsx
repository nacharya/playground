// reactapp/src/components/RealmDashboard.tsx
// ============================================
// Compound Component Pattern — components share state through Context
// without prop-drilling.
//
// Usage of the compound component:
//   <RealmCard realm={realm}>
//     <RealmCard.Header />
//     <RealmCard.Stats />
//     <RealmCard.Actions onEdit={...} onDelete={...} />
//   </RealmCard>
//
// Each sub-component reads the shared realm from Context.

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useRealms, useCreateRealm, useDeleteRealm, type Realm } from "../hooks/useApi";
import { Plus, Edit2, Trash2, Globe, Shield, Cloud } from "lucide-react";

// ── Compound Component Context ────────────────────────────────────────────────
// This is the key pattern: Context scoped to a single component instance,
// not the whole app. Each <RealmCard> has its own context provider.

interface RealmCardContext {
  realm: Realm;
}

const RealmCardCtx = createContext<RealmCardContext | null>(null);

function useRealmCard(): RealmCardContext {
  const ctx = useContext(RealmCardCtx);
  if (!ctx) throw new Error("useRealmCard must be used within <RealmCard>");
  return ctx;
}

// ── RealmCard Compound Component ──────────────────────────────────────────────

interface RealmCardProps {
  realm: Realm;
  children: ReactNode;
}

function RealmCard({ realm, children }: RealmCardProps) {
  return (
    <RealmCardCtx.Provider value={{ realm }}>
      <div className="realm-card">{children}</div>
    </RealmCardCtx.Provider>
  );
}

// Sub-components — each reads from the parent's context

RealmCard.Header = function Header() {
  const { realm } = useRealmCard();
  const icons = {
    AD: <Shield size={16} />,
    Azure: <Cloud size={16} />,
    AWS: <Cloud size={16} />,
    LDAP: <Globe size={16} />,
    UserShared: <Globe size={16} />,
  };

  return (
    <div className="realm-header">
      <span className="realm-type-icon">{icons[realm.type]}</span>
      <div>
        <h3 className="realm-name">{realm.name}</h3>
        <span className={`realm-badge realm-badge--${realm.type.toLowerCase()}`}>{realm.type}</span>
      </div>
    </div>
  );
};

RealmCard.Stats = function Stats() {
  const { realm } = useRealmCard();
  return (
    <div className="realm-stats">
      <div className="stat">
        <span className="stat-value">{realm.userCount}</span>
        <span className="stat-label">users</span>
      </div>
      <div className="stat">
        <span className="stat-value">{realm.appCount}</span>
        <span className="stat-label">apps</span>
      </div>
    </div>
  );
};

RealmCard.Actions = function Actions({
  onEdit,
  onDelete,
}: {
  onEdit: (realm: Realm) => void;
  onDelete: (id: string) => void;
}) {
  const { realm } = useRealmCard();
  return (
    <div className="realm-actions">
      <button className="icon-btn" onClick={() => onEdit(realm)} title="Edit">
        <Edit2 size={14} />
      </button>
      <button className="icon-btn icon-btn--danger" onClick={() => onDelete(realm.id)} title="Delete">
        <Trash2 size={14} />
      </button>
    </div>
  );
};

// ── Create Realm Modal ────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
}

function CreateRealmModal({ onClose }: CreateModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Realm["type"]>("UserShared");
  const [description, setDescription] = useState("");

  const createRealm = useCreateRealm();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRealm.mutate({ name, type, description }, { onSuccess: onClose });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Realm</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>

          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as Realm["type"])}>
              <option value="UserShared">UserShared</option>
              <option value="AD">Active Directory</option>
              <option value="Azure">Azure AD</option>
              <option value="AWS">AWS</option>
              <option value="LDAP">LDAP</option>
            </select>
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={createRealm.isPending} className="btn-primary">
              {createRealm.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── RealmDashboard Page ───────────────────────────────────────────────────────

export default function RealmDashboard() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingRealm, setEditingRealm] = useState<Realm | null>(null);

  // React Query — handles loading, error, caching, and refetch automatically
  const { data: realms, isLoading, error } = useRealms();
  const deleteRealm = useDeleteRealm();

  const handleDelete = (id: string) => {
    if (confirm("Delete this realm?")) {
      deleteRealm.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Loading realms…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-error">
        <p>Failed to load realms: {error.message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Realms</h1>
          <p className="page-subtitle">{realms?.length ?? 0} realms configured</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Realm
        </button>
      </div>

      {/* Grid of realm cards using the Compound Component pattern */}
      <div className="realm-grid">
        {realms?.map((realm) => (
          <RealmCard key={realm.id} realm={realm}>
            <RealmCard.Header />
            <RealmCard.Stats />
            <p className="realm-description">{realm.description}</p>
            <RealmCard.Actions onEdit={setEditingRealm} onDelete={handleDelete} />
          </RealmCard>
        ))}
      </div>

      {realms?.length === 0 && (
        <div className="empty-state">
          <Globe size={48} />
          <h3>No realms yet</h3>
          <p>Create your first realm to get started.</p>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create Realm
          </button>
        </div>
      )}

      {showCreate && <CreateRealmModal onClose={() => setShowCreate(false)} />}

      {/* Edit modal — same form, pre-populated */}
      {editingRealm && (
        <div className="modal-overlay" onClick={() => setEditingRealm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Realm — {editingRealm.name}</h2>
            <p className="text-muted">Edit functionality: wire up useUpdateRealm() hook</p>
            <button onClick={() => setEditingRealm(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
