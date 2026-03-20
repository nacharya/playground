(*
  Grpc/PlaygroundGrpcService.fs — gRPC Service Implementation
  ============================================================

  gRPC in .NET uses Grpc.AspNetCore. The proto file at ../../proto/playground.proto
  defines service contracts. The generated C# stubs are used seamlessly from F#
  (F# is 100% interoperable with C#/.NET libraries).

  After building:
    dotnet add package Grpc.AspNetCore
    Add <Protobuf Include="../../proto/playground.proto" GrpcServices="Server" />
    to the .fsproj to auto-generate stubs on build.

  The generated base classes are:
    UserService.UserServiceBase   — abstract, override methods to implement
    RealmService.RealmServiceBase
    TaskService.TaskServiceBase

  For now, we provide a stub implementation with comments showing what the
  generated code will look like once protoc runs.

  gRPC port: 8509
  Test: grpcurl -plaintext localhost:8509 list
*)
module PlaygroundApi.Grpc.PlaygroundGrpcService

open System.Threading.Tasks
open Grpc.Core
open PlaygroundApi.Domain.Types
open PlaygroundApi.Handlers

(*
  NOTE: The following imports will resolve after running:
    dotnet build  (with <Protobuf Include="..."> in .fsproj)

  The generated types would be imported as:
    open Playground   // the proto package name
*)

// ─────────────────────────────────────────────────────────────────────────────
// Stub service implementation
// ─────────────────────────────────────────────────────────────────────────────
(*
  Real implementation structure (after protoc generates stubs):

  type PlaygroundUserService() =
      inherit UserService.UserServiceBase()

      override _.GetUser(request: GetUserRequest, context: ServerCallContext) : Task<GetUserResponse> =
          task {
              match UserHandlers.store.TryGetValue(request.Username) with
              | true, user ->
                  return GetUserResponse(User = domainUserToProto user)
              | false, _ ->
                  context.Status <- Status(StatusCode.NotFound, $"User '{request.Username}' not found")
                  return GetUserResponse()
          }

      override _.ListUsers(request: ListUsersRequest, context: ServerCallContext) : Task<ListUsersResponse> =
          task {
              let response = ListUsersResponse()
              let users = UserHandlers.store.Values |> Seq.map domainUserToProto
              response.Users.AddRange(users)
              return response
          }

      override _.WatchUsers(request: ListUsersRequest, responseStream: IServerStreamWriter<User>, context: ServerCallContext) : Task =
          task {
              // Server-streaming: send current users, then stream updates
              for user in UserHandlers.store.Values do
                  if not context.CancellationToken.IsCancellationRequested then
                      do! responseStream.WriteAsync(domainUserToProto user)

              // Wait for cancellation (client disconnect or timeout)
              while not context.CancellationToken.IsCancellationRequested do
                  do! Task.Delay(5000, context.CancellationToken)
          }
*)

// Conversion helpers (will use generated proto types after codegen)
// These show the mapping between our domain types and proto messages

(*
  let domainUserToProto (user: User) : Playground.User =
      Playground.User(
          Id         = user.Id,
          Username   = user.Username,
          Email      = user.Email,
          Name       = user.Name,
          Role       = userRoleToString user.Role,
          CreatedAt  = user.CreatedAt.ToString("o"),
          LastAccess = user.LastAccess |> Option.map (fun dt -> dt.ToString("o")) |> Option.defaultValue ""
      )

  let domainTaskToProto (task: Task) : Playground.Task =
      Playground.Task(
          Id        = task.Id,
          Name      = task.Name,
          Text      = task.Text,
          Uid       = task.Uid,
          Completed = (match task.Status with | Done _ -> true | _ -> false)
      )

  let domainRealmToProto (realm: Realm) : Playground.Realm =
      Playground.Realm(
          Id           = realm.Id,
          Name         = realm.Name,
          Active       = realm.Active,
          Type         = realmTypeToString realm.Type,
          Owner        = realm.Owner,
          Tenant       = realm.Tenant,
          AuthProvider = realm.AuthProvider
      )
*)

// ─────────────────────────────────────────────────────────────────────────────
// Registration helper for Program.fs
// ─────────────────────────────────────────────────────────────────────────────

/// Call this in Program.fs:
///   app.MapGrpcService<PlaygroundUserGrpcService>()
///   app.MapGrpcService<PlaygroundTaskGrpcService>()
///   app.MapGrpcService<PlaygroundRealmGrpcService>()
///
/// For now, returns instructions until protoc generates the stubs.
let grpcServicesDescription = """
gRPC Services registered:
  playground.UserService  → PlaygroundUserGrpcService  (port 8509)
  playground.TaskService  → PlaygroundTaskGrpcService  (port 8509)
  playground.RealmService → PlaygroundRealmGrpcService (port 8509)

To activate:
  1. Add to PlaygroundApi.fsproj:
     <ItemGroup>
       <Protobuf Include="../../proto/playground.proto" GrpcServices="Server" />
     </ItemGroup>

  2. dotnet build  (generates C# stubs from proto)

  3. In Program.fs, uncomment:
     app.MapGrpcService<PlaygroundUserGrpcService>()

Test with grpcurl:
  grpcurl -plaintext localhost:8509 list
  grpcurl -plaintext -d '{"username":"alice"}' localhost:8509 playground.UserService/GetUser
"""
