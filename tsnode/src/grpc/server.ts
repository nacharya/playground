/**
 * tsnode/src/grpc/server.ts — gRPC Server
 * =========================================
 *
 * gRPC (gRPC Remote Procedure Call) is a high-performance RPC framework
 * built on HTTP/2 and Protocol Buffers.
 *
 * Advantages over REST:
 *   - Binary serialization (protobuf) → ~5-10x smaller payloads
 *   - Strongly typed contracts → runtime-validated interfaces
 *   - Streaming RPCs → server-push, client-streaming, bidirectional
 *   - HTTP/2 multiplexing → multiple concurrent RPCs over one connection
 *   - Code generation → clients in any language from one .proto file
 *
 * Node.js gRPC options:
 *   @grpc/grpc-js  — Pure JavaScript implementation (what we use)
 *   @grpc/proto-loader — Dynamic loading of .proto files (no code gen needed)
 *
 * Dynamic loading vs code generation:
 *   Dynamic: load .proto at runtime → no build step, easier for prototyping
 *   Generated (ts-proto, protoc-gen-ts): types at compile time → better DX in prod
 *
 * Test with grpcurl (after starting the server):
 *   grpcurl -plaintext localhost:8513 list
 *   grpcurl -plaintext localhost:8513 playground.UserService/ListUsers
 *   grpcurl -plaintext -d '{"username":"alice"}' localhost:8513 playground.UserService/GetUser
 */

import * as path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (shared with tRPC — in production inject a DB client)
// ─────────────────────────────────────────────────────────────────────────────

const store = {
  users: new Map([
    ["alice", { id: "1", username: "alice", email: "alice@example.com", name: "Alice Smith", role: "Admin", realmIds: ["realm-1"] }],
    ["bob",   { id: "2", username: "bob",   email: "bob@example.com",   name: "Bob Jones",   role: "Contributor", realmIds: [] }],
  ]),
  tasks: new Map([
    ["t1", { id: "t1", name: "Setup CI",    text: "Configure GitHub Actions", completed: false, uid: "1" }],
    ["t2", { id: "t2", name: "Write docs",  text: "Document the API",         completed: false, uid: "2" }],
  ]),
  realms: new Map([
    ["realm-1", { id: "realm-1", name: "corp-azure", active: true, type: "AZURE", owner: "alice", tenant: "Corp" }],
  ]),
};

// ─────────────────────────────────────────────────────────────────────────────
// Load proto definition
// ─────────────────────────────────────────────────────────────────────────────

// Path to the shared proto file (relative to the repo root)
const PROTO_PATH = path.resolve(__dirname, "../../../proto/playground.proto");

function loadProtoDefinition() {
  // proto-loader reads the .proto file and returns a package definition
  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,          // Preserve field names as-is (don't camelCase)
    longs: String,           // Represent int64 as string (JS can't handle large int64)
    enums: String,           // Represent enums as strings
    defaults: true,          // Include default values in messages
    oneofs: true,            // Represent oneof as virtual field
    includeDirs: [path.dirname(PROTO_PATH)],
  });

  // @grpc/grpc-js turns the package definition into usable service descriptors
  return grpc.loadPackageDefinition(packageDef) as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service implementations
// ─────────────────────────────────────────────────────────────────────────────

// Each handler has signature: (call: ServerUnaryCall<Req, Res>, cb: sendUnaryData<Res>) => void
// For streaming: (call: ServerWritableStream<Req, Res>) => void

const userService = {
  GetUser(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    const username = call.request["username"] as string;
    const user = store.users.get(username);
    if (!user) {
      return cb({ code: grpc.status.NOT_FOUND, message: `User "${username}" not found` });
    }
    cb(null, { user });
  },

  ListUsers(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    const realmFilter = call.request["realm_id"] as string | undefined;
    let users = Array.from(store.users.values());
    if (realmFilter) {
      users = users.filter(u => u.realmIds.includes(realmFilter));
    }
    cb(null, { users });
  },

  CreateUser(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    const req = call.request;
    const username = req["username"] as string;
    if (store.users.has(username)) {
      return cb({ code: grpc.status.ALREADY_EXISTS, message: `User "${username}" already exists` });
    }
    const user = {
      id: Math.random().toString(36).slice(2),
      username,
      email: req["email"] as string,
      name: req["name"] as string,
      role: req["role"] as string ?? "ReadOnly",
      realmIds: (req["realm_ids"] as string[]) ?? [],
    };
    store.users.set(username, user);
    cb(null, { user });
  },

  DeleteUser(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    const username = call.request["username"] as string;
    const deleted = store.users.delete(username);
    cb(null, { success: deleted, message: deleted ? "Deleted" : "Not found" });
  },

  // Server-streaming: sends all users as a stream
  WatchUsers(call: grpc.ServerWritableStream<Record<string, unknown>, unknown>) {
    // Send current users immediately
    for (const user of store.users.values()) {
      call.write(user);
    }

    // Keep sending updates every 10 seconds (simulate live updates)
    const interval = setInterval(() => {
      if (call.cancelled) {
        clearInterval(interval);
        return;
      }
      for (const user of store.users.values()) {
        call.write(user);
      }
    }, 10_000);

    call.on("cancelled", () => clearInterval(interval));
    call.on("close", () => clearInterval(interval));
  },
};

const taskService = {
  ListTasks(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    let tasks = Array.from(store.tasks.values());
    if (call.request["uid"]) tasks = tasks.filter(t => t.uid === call.request["uid"]);
    if (call.request["only_pending"]) tasks = tasks.filter(t => !t.completed);
    cb(null, { tasks });
  },

  GetTask(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    const task = store.tasks.get(call.request["id"] as string);
    if (!task) return cb({ code: grpc.status.NOT_FOUND, message: "Task not found" });
    cb(null, { task });
  },

  StreamTasks(call: grpc.ServerWritableStream<Record<string, unknown>, unknown>) {
    // Server-streaming: push tasks every 5 seconds
    const send = () => {
      for (const task of store.tasks.values()) {
        if (!call.cancelled) call.write(task);
      }
    };
    send();
    const interval = setInterval(send, 5_000);
    call.on("cancelled", () => clearInterval(interval));
    call.on("close", () => clearInterval(interval));
  },
};

const realmService = {
  ListRealms(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    let realms = Array.from(store.realms.values());
    if (call.request["only_active"]) realms = realms.filter(r => r.active);
    cb(null, { realms });
  },

  GetRealm(call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>, cb: grpc.sendUnaryData<unknown>) {
    const realm = store.realms.get(call.request["name"] as string);
    if (!realm) return cb({ code: grpc.status.NOT_FOUND, message: "Realm not found" });
    cb(null, { realm });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Server interceptor (middleware)
// ─────────────────────────────────────────────────────────────────────────────

function loggingInterceptor(
  options: grpc.InterceptorOptions,
  nextCall: (options: grpc.InterceptorOptions) => grpc.InterceptingCall
): grpc.InterceptingCall {
  // Note: server interceptors in @grpc/grpc-js have limited support.
  // For production, prefer wrapping individual handlers.
  return nextCall(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Server startup
// ─────────────────────────────────────────────────────────────────────────────

export async function startGRPCServer(port: number, log: Logger): Promise<grpc.Server> {
  let proto: Record<string, unknown>;

  try {
    proto = loadProtoDefinition();
  } catch (err) {
    log.warn({ err, protoPath: PROTO_PATH },
      "Could not load proto file — gRPC server will not start. " +
      "Run 'make proto' to generate proto files."
    );
    // Return a stub so the rest of the server starts fine
    return new grpc.Server();
  }

  const server = new grpc.Server();

  // Register services from the loaded proto
  // The type assertions are needed because proto-loader returns dynamic types
  const playground = proto["playground"] as Record<string, { service: grpc.ServiceDefinition }>;

  if (playground?.["UserService"]) {
    server.addService(playground["UserService"].service, userService as unknown as grpc.UntypedServiceImplementation);
  }
  if (playground?.["TaskService"]) {
    server.addService(playground["TaskService"].service, taskService as unknown as grpc.UntypedServiceImplementation);
  }
  if (playground?.["RealmService"]) {
    server.addService(playground["RealmService"].service, realmService as unknown as grpc.UntypedServiceImplementation);
  }

  const addr = `0.0.0.0:${port}`;

  return new Promise((resolve, reject) => {
    server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err, actualPort) => {
      if (err) {
        log.error({ err, port }, "Failed to bind gRPC server");
        return reject(err);
      }
      server.start();
      log.info({ port: actualPort }, "gRPC server bound and started");
      resolve(server);
    });
  });
}
