(*
  Program.fs — ASP.NET Core Application Entry Point
  ===================================================

  In .NET 8 Minimal API style, Program.fs is the entire app setup.
  F# uses the same WebApplication builder as C#, just with F# syntax.

  This program exposes:
    REST API : http://+:8508 (configured via ASPNETCORE_URLS env var)
    gRPC     : https://+:8509 (requires HTTP/2; use HTTP for local dev)

  Route map:
    GET    /health                → health check
    GET    /api/v1/users          → list users
    GET    /api/v1/users/{name}   → get user
    POST   /api/v1/users          → create user
    PUT    /api/v1/users/{name}   → update user
    DELETE /api/v1/users/{name}   → delete user
    GET    /api/v1/realms         → list realms
    (same CRUD pattern for realms, tasks)
    gRPC   /playground.*          → all services from playground.proto

  Key F# note:
    F# functions are NOT automatically coerced to System.Delegate.
    Minimal API MapGet/MapPost overloads accept System.Delegate, so we
    must wrap handlers in explicit System.Func<> to help type inference.
*)
module PlaygroundApi.Program

open System
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open PlaygroundApi.Domain.Types
open PlaygroundApi.Handlers

[<EntryPoint>]
let main args =
    let builder = WebApplication.CreateBuilder(args)

    // ── Services ────────────────────────────────────────────────────────────

    // gRPC support
    builder.Services.AddGrpc(fun options ->
        options.EnableDetailedErrors <- true
    ) |> ignore

    // CORS — allow the React app (port 3000 dev / port 80 prod) to call us
    builder.Services.AddCors(fun options ->
        options.AddPolicy("AllowPlayground", fun policy ->
            policy
                .WithOrigins("http://localhost:3000", "http://localhost:80", "http://reactapp")
                .AllowAnyHeader()
                .AllowAnyMethod()
            |> ignore
        )
    ) |> ignore

    let app = builder.Build()

    // ── Middleware pipeline ─────────────────────────────────────────────────
    app.UseCors("AllowPlayground") |> ignore

    // ── Health check ────────────────────────────────────────────────────────
    // Func<IResult> tells the compiler which Delegate overload to use
    app.MapGet("/health",
        Func<IResult>(fun () ->
            Results.Ok {| status = "ok"; service = "fsharp-playground"; timestamp = DateTime.UtcNow |}
        )
    ) |> ignore

    // ── User endpoints ──────────────────────────────────────────────────────
    // F# curried functions need Func<> wrappers to resolve MapGet/MapPost overloads.
    // For multi-parameter handlers (route param + body), use Func<string, T, IResult>.

    app.MapGet("/api/v1/users",         Func<IResult>(UserHandlers.listUsers))                               |> ignore
    app.MapGet("/api/v1/users/{username}", Func<string, IResult>(UserHandlers.getUser))                       |> ignore
    app.MapPost("/api/v1/users",        Func<CreateUserDto, IResult>(UserHandlers.createUser))               |> ignore
    app.MapPut("/api/v1/users/{username}",
        Func<string, CreateUserDto, IResult>(fun u dto -> UserHandlers.updateUser u dto))                    |> ignore
    app.MapDelete("/api/v1/users/{username}", Func<string, IResult>(UserHandlers.deleteUser))                |> ignore

    // ── Realm endpoints ─────────────────────────────────────────────────────
    app.MapGet("/api/v1/realms",            Func<IResult>(RealmHandlers.listRealms))                         |> ignore
    app.MapGet("/api/v1/realms/{name}",     Func<string, IResult>(RealmHandlers.getRealm))                   |> ignore
    app.MapPost("/api/v1/realms",           Func<CreateRealmDto, IResult>(RealmHandlers.createRealm))        |> ignore
    app.MapPut("/api/v1/realms/{name}",
        Func<string, CreateRealmDto, IResult>(fun n dto -> RealmHandlers.updateRealm n dto))                 |> ignore
    app.MapDelete("/api/v1/realms/{name}",  Func<string, IResult>(RealmHandlers.deleteRealm))                |> ignore

    // ── Task endpoints ──────────────────────────────────────────────────────
    // Optional query params: use nullable string, convert to option
    app.MapGet("/api/v1/tasks",
        Func<string, IResult>(fun uid ->
            let uidOpt = if String.IsNullOrEmpty uid then None else Some uid
            TaskHandlers.listTasks uidOpt
        )
    ) |> ignore
    app.MapGet("/api/v1/tasks/{id}",        Func<string, IResult>(TaskHandlers.getTask))                     |> ignore
    app.MapPost("/api/v1/tasks",            Func<CreateTaskDto, IResult>(TaskHandlers.createTask))           |> ignore
    app.MapPut("/api/v1/tasks/{id}/status",
        Func<string, UpdateTaskStatusDto, IResult>(fun i dto -> TaskHandlers.transitionTask i dto))          |> ignore
    app.MapDelete("/api/v1/tasks/{id}",     Func<string, IResult>(TaskHandlers.deleteTask))                  |> ignore

    // ── gRPC endpoints ──────────────────────────────────────────────────────
    // Uncomment after running `dotnet build` with Protobuf ItemGroup in .fsproj:
    //   app.MapGrpcService<Grpc.PlaygroundGrpcService.PlaygroundUserService>() |> ignore
    //   app.MapGrpcService<Grpc.PlaygroundGrpcService.PlaygroundRealmService>() |> ignore
    //   app.MapGrpcService<Grpc.PlaygroundGrpcService.PlaygroundTaskService>() |> ignore

    printfn "%s" PlaygroundApi.Grpc.PlaygroundGrpcService.grpcServicesDescription

    app.Run()
    0  // Exit code
