// reactapp/src/components/UserTable.tsx
// =======================================
// Generic Table<T> component — fully type-safe reusable table.
//
// Key pattern: Generic components with column definitions.
// The column definition carries the accessor function and renderer,
// so the table works with any data shape without losing type safety.
//
// Usage:
//   <Table
//     data={users}
//     columns={[
//       { key: "name", header: "Name", accessor: (u) => u.name },
//       { key: "email", header: "Email", accessor: (u) => u.email },
//       { key: "actions", header: "", render: (u) => <button>Edit</button> },
//     ]}
//   />

import { useState, useMemo } from "react";
import { useUsers, useDeleteUser, type User } from "../hooks/useApi";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, UserPlus, Trash2, Edit2 } from "lucide-react";

// ── Generic Table Component ───────────────────────────────────────────────────

// Column definition — T is the row data type
interface Column<T> {
  key: string;
  header: string;
  // accessor extracts a sortable/displayable value from the row
  accessor?: (row: T) => string | number | boolean;
  // render overrides the cell content entirely (for custom cells)
  render?: (row: T) => React.ReactNode;
  // sortable: defaults to true if accessor is provided
  sortable?: boolean;
  width?: string;
}

type SortDir = "asc" | "desc" | null;

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

// Generic function component — TypeScript requires the <T,> syntax in .tsx
// to disambiguate from JSX tags.
function Table<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  emptyMessage = "No data",
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function handleSort(col: Column<T>) {
    if (!col.accessor) return;
    if (sortKey === col.key) {
      // Cycle: asc → desc → null
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
      if (sortDir === "desc") setSortKey(null);
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  // useMemo: only re-sort when data/sortKey/sortDir changes
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.accessor) return data;

    return [...data].sort((a, b) => {
      const av = col.accessor!(a);
      const bv = col.accessor!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  function SortIcon({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) return <ArrowUpDown size={12} className="sort-icon sort-icon--inactive" />;
    return sortDir === "asc"
      ? <ArrowUp size={12} className="sort-icon" />
      : <ArrowDown size={12} className="sort-icon" />;
  }

  if (data.length === 0) {
    return <div className="table-empty">{emptyMessage}</div>;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const isSortable = col.sortable !== false && !!col.accessor;
              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={isSortable ? "sortable" : ""}
                  onClick={() => isSortable && handleSort(col)}
                >
                  <span className="th-content">
                    {col.header}
                    {isSortable && <SortIcon colKey={col.key} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? "clickable" : ""}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render
                    ? col.render(row)
                    : col.accessor
                    ? String(col.accessor(row))
                    : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── User-specific types and columns ───────────────────────────────────────────
// User type is imported from useApi.ts

// ── UserTable Page ────────────────────────────────────────────────────────────

export default function UserTable() {
  const [search, setSearch] = useState("");
  const { data: users, isLoading, error } = useUsers();
  const deleteUser = useDeleteUser();

  // Client-side filter (complement to server-side pagination for small datasets)
  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  const columns: Column<User>[] = [
    {
      key: "username",
      header: "Username",
      accessor: (u) => u.username,
      render: (u) => (
        <span className="username-cell">
          <span className="avatar">{u.username[0]?.toUpperCase()}</span>
          {u.username}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      accessor: (u) => u.email,
    },
    {
      key: "role",
      header: "Role",
      accessor: (u) => u.role,
      render: (u) => (
        <span className={`role-badge role-badge--${u.role.toLowerCase()}`}>{u.role}</span>
      ),
    },
    {
      key: "realmCount",
      header: "Realms",
      accessor: (u) => u.realmCount,
      width: "80px",
    },
    {
      key: "createdAt",
      header: "Joined",
      accessor: (u) => u.createdAt,
      render: (u) => new Date(u.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      sortable: false,
      width: "80px",
      render: (u) => (
        <div className="row-actions">
          <button className="icon-btn" title="Edit user">
            <Edit2 size={13} />
          </button>
          <button
            className="icon-btn icon-btn--danger"
            title="Delete user"
            onClick={(e) => {
              e.stopPropagation(); // prevent row click
              if (confirm(`Delete user ${u.username}?`)) {
                deleteUser.mutate(u.id);
              }
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-subtitle">{filtered.length} of {users?.length ?? 0} users</p>
        </div>
        <button className="btn-primary">
          <UserPlus size={16} /> Invite User
        </button>
      </div>

      {/* Search bar */}
      <div className="search-bar">
        <Search size={16} className="search-icon" />
        <input
          type="search"
          placeholder="Search by name, email, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      {isLoading && (
        <div className="page-loading">
          <div className="spinner" />
        </div>
      )}

      {error && (
        <div className="page-error">Failed to load users: {error.message}</div>
      )}

      {/* Generic Table<User> — fully typed, sortable, filterable */}
      {!isLoading && !error && (
        <Table<User>
          data={filtered}
          columns={columns}
          rowKey={(u) => u.id}
          emptyMessage={search ? `No users matching "${search}"` : "No users yet"}
        />
      )}
    </div>
  );
}
