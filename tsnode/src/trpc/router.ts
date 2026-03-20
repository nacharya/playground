/**
 * tsnode/src/trpc/router.ts — tRPC Router
 * =========================================
 *
 * tRPC provides end-to-end type safety between server and client WITHOUT
 * code generation, API specs, or runtime type conversion.
 *
 * How it works:
 *   1. You define procedures (queries/mutations) with Zod input schemas
 *   2. tRPC infers the complete type of the router (AppRouter)
 *   3. The client imports AppRouter as a type — no runtime import, types only
 *   4. The client gets full autocomplete and type checking for all calls
 *
 * Mental model: tRPC procedures are like typed RPC calls. Instead of:
 *   fetch('/api/users/alice')  // No type info at call site
 * You write:
 *   trpc.user.get.query({ username: 'alice' })  // Fully typed, autocompleted
 *
 * Pattern: Input validation (Zod) → Business logic → Typed response
 *
 * See also: https://trpc.io/docs
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Request } from "express";
import axios from "axios";

// ─────────────────────────────────────────────────────────────────────────────
// Context — available in every procedure
// ─────────────────────────────────────────────────────────────────────────────
// Context is created per-request (see server.ts createContext).
// Use it for: authenticated user, database connection, request ID, etc.

type Context = {
  req: Request;
  authHeader?: string;
  goffjUrl: string;
};

const t = initTRPC.context<Context>().create();

// Re-export for use when defining individual route files
export const router     = t.router;
export const procedure  = t.procedure;
export const middleware = t.middleware;

// ─────────────────────────────────────────────────────────────────────────────
// Domain types (mirror goffj core/models.go)
// ─────────────────────────────────────────────────────────────────────────────

const UserSchema = z.object({
  id:         z.string(),
  username:   z.string(),
  email:      z.string().email(),
  name:       z.string(),
  role:       z.enum(["Admin", "Contributor", "ReadOnly"]),
  createdAt:  z.string().default(() => new Date().toISOString()),
  lastAccess: z.string().default(""),
  realms:     z.array(z.string()).default([]),
});

const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true, lastAccess: true });
const UpdateUserSchema = z.object({
  id:    z.string(),
  email: z.string().email().optional(),
  name:  z.string().optional(),
  role:  z.enum(["Admin", "Contributor", "ReadOnly"]).optional(),
});

const RealmSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  active:       z.boolean().default(true),
  type:         z.enum(["AD", "AZURE", "AWS", "LDAP", "UserShared"]),
  owner:        z.string(),
  tenant:       z.string().default(""),
  authProvider: z.string().default(""),
});

const CreateRealmSchema = RealmSchema.omit({ id: true });

const TaskSchema = z.object({
  id:        z.string(),
  name:      z.string(),
  text:      z.string(),
  completed: z.boolean().default(false),
  uid:       z.string(),
  due:       z.string().datetime().optional(),
});

const CreateTaskSchema = TaskSchema.omit({ id: true });

// Infer TypeScript types from Zod schemas — single source of truth
type User   = z.infer<typeof UserSchema>;
type Realm  = z.infer<typeof RealmSchema>;
type Task   = z.infer<typeof TaskSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (for demo — replace with DB layer in production)
// ─────────────────────────────────────────────────────────────────────────────

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const store = {
  users: new Map<string, User>([
    ["alice", { id: "1", username: "alice", email: "alice@example.com", name: "Alice Smith",
                role: "Admin", createdAt: "2024-01-01T00:00:00Z", lastAccess: "", realms: ["realm-1"] }],
    ["bob",   { id: "2", username: "bob",   email: "bob@example.com",   name: "Bob Jones",
                role: "Contributor", createdAt: "2024-01-02T00:00:00Z", lastAccess: "", realms: [] }],
  ]),
  realms: new Map<string, Realm>([
    ["realm-1", { id: "realm-1", name: "corp-azure", active: true, type: "AZURE", owner: "alice", tenant: "Corp", authProvider: "Azure AD" }],
  ]),
  tasks: new Map<string, Task>([
    ["t1", { id: "t1", name: "Setup CI", text: "Configure GitHub Actions", completed: false, uid: "1" }],
    ["t2", { id: "t2", name: "Write docs", text: "Document the API", completed: false, uid: "2" }],
  ]),
};

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

// Logging middleware — wraps every procedure
const withLogging = middleware(async ({ next, path, type }) => {
  const start = Date.now();
  const result = await next();
  const elapsed = Date.now() - start;
  console.log(`[tRPC] ${type} ${path} — ${elapsed}ms`);
  return result;
});

// Base procedure with logging applied
const loggedProcedure = procedure.use(withLogging);

// ─────────────────────────────────────────────────────────────────────────────
// User Router
// ─────────────────────────────────────────────────────────────────────────────

const userRouter = router({
  /**
   * user.get — Query a single user by username
   *
   * Queries never change data. They're GET-equivalent.
   * Input is validated by Zod before your handler runs — if validation fails,
   * tRPC returns a TRPCError(BAD_REQUEST) automatically.
   */
  get: loggedProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(({ input }) => {
      const user = store.users.get(input.username);
      if (!user) {
        // TRPCError maps to HTTP status codes:
        // NOT_FOUND → 404, BAD_REQUEST → 400, UNAUTHORIZED → 401, etc.
        throw new TRPCError({ code: "NOT_FOUND", message: `User "${input.username}" not found` });
      }
      return user;
    }),

  /**
   * user.list — Query all users, optionally filtered by realm
   */
  list: loggedProcedure
    .input(z.object({ realmId: z.string().optional() }).optional())
    .query(({ input }) => {
      let users = Array.from(store.users.values());
      if (input?.realmId) {
        users = users.filter(u => u.realms.includes(input.realmId!));
      }
      return users;
    }),

  /**
   * user.create — Mutation to create a new user
   *
   * Mutations change data. They're POST/PUT/DELETE-equivalent.
   * The return type is inferred automatically — no explicit annotation needed.
   */
  create: loggedProcedure
    .input(CreateUserSchema)
    .mutation(({ input }) => {
      if (store.users.has(input.username)) {
        throw new TRPCError({ code: "CONFLICT", message: `User "${input.username}" already exists` });
      }
      const user: User = { ...input, id: uuid(), createdAt: new Date().toISOString(), lastAccess: "" };
      store.users.set(user.username, user);
      return user;
    }),

  /**
   * user.update — Mutation to update a user
   */
  update: loggedProcedure
    .input(UpdateUserSchema)
    .mutation(({ input }) => {
      const user = Array.from(store.users.values()).find(u => u.id === input.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: `User id "${input.id}" not found` });
      const updated: User = {
        ...user,
        email: input.email ?? user.email,
        name:  input.name  ?? user.name,
        role:  input.role  ?? user.role,
      };
      store.users.set(user.username, updated);
      return updated;
    }),

  /**
   * user.delete — Mutation to remove a user
   */
  delete: loggedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(({ input }) => {
      if (!store.users.has(input.username)) {
        throw new TRPCError({ code: "NOT_FOUND", message: `User "${input.username}" not found` });
      }
      store.users.delete(input.username);
      return { success: true };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Realm Router
// ─────────────────────────────────────────────────────────────────────────────

const realmRouter = router({
  get: loggedProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      const realm = store.realms.get(input.name);
      if (!realm) throw new TRPCError({ code: "NOT_FOUND", message: `Realm "${input.name}" not found` });
      return realm;
    }),

  list: loggedProcedure
    .input(z.object({ onlyActive: z.boolean().optional() }).optional())
    .query(({ input }) => {
      let realms = Array.from(store.realms.values());
      if (input?.onlyActive) realms = realms.filter(r => r.active);
      return realms;
    }),

  create: loggedProcedure
    .input(CreateRealmSchema)
    .mutation(({ input }) => {
      const realm: Realm = { ...input, id: uuid() };
      store.realms.set(realm.name, realm);
      return realm;
    }),

  delete: loggedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => {
      store.realms.delete(input.name);
      return { success: true };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Task Router
// ─────────────────────────────────────────────────────────────────────────────

const taskRouter = router({
  get: loggedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const task = store.tasks.get(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: `Task "${input.id}" not found` });
      return task;
    }),

  list: loggedProcedure
    .input(z.object({ uid: z.string().optional(), onlyPending: z.boolean().optional() }).optional())
    .query(({ input }) => {
      let tasks = Array.from(store.tasks.values());
      if (input?.uid)          tasks = tasks.filter(t => t.uid === input.uid);
      if (input?.onlyPending)  tasks = tasks.filter(t => !t.completed);
      return tasks;
    }),

  create: loggedProcedure
    .input(CreateTaskSchema)
    .mutation(({ input }) => {
      const task: Task = { ...input, id: uuid() };
      store.tasks.set(task.id, task);
      return task;
    }),

  complete: loggedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const task = store.tasks.get(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: `Task "${input.id}" not found` });
      const updated: Task = { ...task, completed: true };
      store.tasks.set(input.id, updated);
      return updated;
    }),

  delete: loggedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      store.tasks.delete(input.id);
      return { success: true };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Health Router — checks goffj connectivity
// ─────────────────────────────────────────────────────────────────────────────

const healthRouter = router({
  /**
   * health.check — checks this service and goffj upstream
   *
   * Context is available in every procedure — here we use ctx.goffjUrl
   * to call the upstream goffj service and report its status.
   */
  check: loggedProcedure.query(async ({ ctx }) => {
    let goffjStatus: "ok" | "unreachable" = "unreachable";
    try {
      const resp = await axios.get(`${ctx.goffjUrl}/healthcheck`, { timeout: 3000 });
      if (resp.status === 200) goffjStatus = "ok";
    } catch {
      // goffj might not be running in local dev — that's ok
    }

    return {
      tsnode:  "ok",
      goffj:   goffjStatus,
      timestamp: new Date().toISOString(),
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Root Router — compose all sub-routers
// ─────────────────────────────────────────────────────────────────────────────
// This is the type exported to clients. The client side does:
//   import type { AppRouter } from './trpc/router'
//   const trpc = createTRPCProxyClient<AppRouter>({ links: [...] })
//   trpc.user.get.query({ username: 'alice' })  // Fully typed!

export const appRouter = router({
  user:   userRouter,
  realm:  realmRouter,
  task:   taskRouter,
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
