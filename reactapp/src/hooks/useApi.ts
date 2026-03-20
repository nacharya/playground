/**
 * reactapp/src/hooks/useApi.ts — Data Fetching with React Query
 * ==============================================================
 *
 * React Query manages server state: fetching, caching, synchronizing,
 * and updating remote data. It solves the "async state management" problem.
 *
 * Key concepts:
 *   Query key    — unique cache identifier, like a cache key in Redis.
 *                  ["users"] caches all users; ["users", "alice"] caches one.
 *   staleTime    — how long cached data is considered "fresh" (no background refetch)
 *   Invalidation — tell React Query "this data changed, please refetch"
 *   Optimistic update — update the UI immediately, roll back if the mutation fails
 *
 * Rule of thumb:
 *   GET  operations → useQuery   (reads, cached, auto-refreshed)
 *   POST/PUT/DELETE  → useMutation (writes, with optimistic updates)
 */

import axios from "axios";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryKey,
} from "@tanstack/react-query";

// ─────────────────────────────────────────────────────────────────────────────
// API base
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:8500";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Domain types (mirroring goffj/core/models.go)
// ─────────────────────────────────────────────────────────────────────────────

export interface Realm {
  id: string;
  name: string;
  active: boolean;
  type: "AD" | "Azure" | "AWS" | "LDAP" | "UserShared";
  owner: string;
  tenant: string;
  authProvider: string;
  description: string;
  userCount: number;
  appCount: number;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "Admin" | "Contributor" | "ReadOnly";
  createdAt: string;
  lastAccess: string;
  realms: string[];
  realmCount: number;
}

export interface Task {
  id: string;
  name: string;
  text: string;
  completed: boolean;
  uid: string;
  due?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic base hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic query hook — the foundation for all specific data hooks.
 *
 * T: the type of data returned by the API
 * key: React Query cache key (string array for namespacing)
 * url: API endpoint
 */
export function useApiQuery<T>(
  key: QueryKey,
  url: string,
  options?: { enabled?: boolean; staleTime?: number }
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>(url);
      return response.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
  });
}

/**
 * Generic mutation hook for POST/PUT/DELETE operations.
 *
 * TInput: request body type
 * TOutput: response type
 */
export function useApiMutation<TInput, TOutput>(
  url: string,
  method: "post" | "put" | "delete",
  options?: {
    invalidateKeys?: QueryKey[];
    onSuccess?: (data: TOutput) => void;
  }
): UseMutationResult<TOutput, Error, TInput> {
  const queryClient = useQueryClient();

  return useMutation<TOutput, Error, TInput>({
    mutationFn: async (input: TInput): Promise<TOutput> => {
      const response = await api.request<TOutput>({ url, method, data: input });
      return response.data;
    },

    onSuccess: (data) => {
      // Invalidate all specified query keys so they refetch
      // This ensures the UI reflects the change immediately
      options?.invalidateKeys?.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key });
      });
      options?.onSuccess?.(data);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Realm hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all realms. Auto-refreshed when the query key is invalidated. */
export function useRealms() {
  return useApiQuery<Realm[]>(["realms"], "/api/v1/realm/");
}

/** Fetch a single realm by name. */
export function useRealm(name: string) {
  return useApiQuery<Realm>(
    ["realms", name],
    `/api/v1/realm/${name}`,
    { enabled: !!name }
  );
}

export type CreateRealmInput = Pick<Realm, "name" | "type"> & Partial<Omit<Realm, "id" | "name" | "type">>;

/** Create a new realm and invalidate the realms list cache. */
export function useCreateRealm() {
  return useApiMutation<CreateRealmInput, Realm>(
    "/api/v1/realm/new",
    "post",
    { invalidateKeys: [["realms"]] }
  );
}

/** Update realm and invalidate both the list and the specific realm cache. */
export function useUpdateRealm(name: string) {
  return useApiMutation<Partial<Realm>, Realm>(
    `/api/v1/realm/${name}`,
    "put",
    { invalidateKeys: [["realms"], ["realms", name]] }
  );
}

/** Delete realm with optimistic update. */
export function useDeleteRealm() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (name: string): Promise<void> => {
      await api.delete(`/api/v1/realm/${name}`);
    },

    // Optimistic update: remove from cache BEFORE the request completes
    onMutate: async (name: string) => {
      // Cancel any in-flight refetches (they would overwrite optimistic update)
      await queryClient.cancelQueries({ queryKey: ["realms"] });

      // Snapshot the current value for rollback
      const previousRealms = queryClient.getQueryData<Realm[]>(["realms"]);

      // Optimistically update the cache
      queryClient.setQueryData<Realm[]>(["realms"], (old) =>
        old?.filter((r) => r.name !== name) ?? []
      );

      // Return snapshot so onError can roll it back
      return { previousRealms };
    },

    onError: (_err, _name, context) => {
      // Rollback: restore the snapshot
      const ctx = context as { previousRealms?: Realm[] } | undefined;
      if (ctx?.previousRealms) {
        queryClient.setQueryData(["realms"], ctx.previousRealms);
      }
    },

    onSettled: () => {
      // Whether success or error, sync with server
      void queryClient.invalidateQueries({ queryKey: ["realms"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// User hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useUsers() {
  return useApiQuery<User[]>(["users"], "/api/v1/user/");
}

export function useUser(username: string) {
  return useApiQuery<User>(
    ["users", username],
    `/api/v1/user/${username}`,
    { enabled: !!username }
  );
}

export function useCreateUser() {
  return useApiMutation<Omit<User, "id">, User>(
    "/api/v1/user/new",
    "post",
    { invalidateKeys: [["users"]] }
  );
}

export function useUpdateUser(username: string) {
  return useApiMutation<Partial<User>, User>(
    `/api/v1/user/${username}`,
    "put",
    { invalidateKeys: [["users"], ["users", username]] }
  );
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/api/v1/user/${id}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Task hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useTasks() {
  return useApiQuery<Task[]>(["tasks"], "/api/v1/task/");
}

export function useTask(id: string) {
  return useApiQuery<Task>(
    ["tasks", id],
    `/api/v1/task/${id}`,
    { enabled: !!id }
  );
}

export function useCreateTask() {
  return useApiMutation<Omit<Task, "id">, Task>(
    "/api/v1/task/new",
    "post",
    { invalidateKeys: [["tasks"]] }
  );
}

export function useUpdateTask(id: string) {
  return useApiMutation<Partial<Task>, Task>(
    `/api/v1/task/${id}`,
    "put",
    { invalidateKeys: [["tasks"], ["tasks", id]] }
  );
}

export function useDeleteTask() {
  return useApiMutation<string, void>(
    "/api/v1/task",
    "delete",
    { invalidateKeys: [["tasks"]] }
  );
}
