# Proto — Shared gRPC Contract

`playground.proto` defines the shared Protobuf3 contract for all 5 services.
Every language generates stubs from this single source of truth.

## Services

| Service | Methods |
|---|---|
| `UserService` | GetUser, ListUsers, CreateUser, UpdateUser, DeleteUser, WatchUsers (stream) |
| `RealmService` | GetRealm, ListRealms, CreateRealm, UpdateRealm, DeleteRealm |
| `TaskService` | GetTask, ListTasks, CreateTask, UpdateTask, DeleteTask, StreamTasks (stream) |
| `AppService` | GetApp, ListApps, CreateApp, UpdateApp, DeleteApp |

## Generating stubs

Run from the repo root:

```bash
make proto
```

Or per language:

### Go
```bash
cd proto
protoc --go_out=../goffj/grpc/pb --go-grpc_out=../goffj/grpc/pb playground.proto
```
Output: `goffj/grpc/pb/*.pb.go` (gitignored — regenerate after any proto change)

### Python
```bash
cd proto
python -m grpc_tools.protoc -I. \
  --python_out=../playui/proto \
  --grpc_python_out=../playui/proto \
  playground.proto
```

### TypeScript / Node.js
TypeScript uses **dynamic loading** (`@grpc/proto-loader`) — no code generation step needed.
The proto file is loaded at runtime in `tsnode/src/grpc/server.ts`.

### Rust (pgctl)
Rust uses `tonic-build` in `pgctl/build.rs` — stubs generate automatically on `cargo build`.

### F# (ASP.NET Core)
F# uses `Grpc.Tools` NuGet package — stubs generate automatically on `dotnet build`
once the `<Protobuf>` item group is added to the `.fsproj`.

## Ports

| Service | REST | HTTP2/gRPC |
|---|---|---|
| goffj (Go) | 8500 | 8510 |
| pgctl (Rust) | 8502 | 8511 |
| playui (Python) | 8505 | 8512 |
| tsnode (TypeScript) | 8506 | 8513 |
| fsharp (F#) | 8508 | 8509 |

## Proto3 concepts

```protobuf
// Streaming — server sends multiple responses for one request
rpc WatchUsers(ListUsersRequest) returns (stream User);

// Optional fields (proto3: all fields are optional, use field presence for explicit null)
message User {
  string id = 1;          // field number 1 (used in binary encoding, NEVER reuse)
  optional string bio = 6; // explicit optional — distinguishes "" from not-set
}

// Enums
enum UserRole {
  USER_ROLE_UNSPECIFIED = 0;  // proto3 requires 0 default
  USER_ROLE_ADMIN = 1;
}
```
