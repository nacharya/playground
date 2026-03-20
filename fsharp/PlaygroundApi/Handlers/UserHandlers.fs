(*
  Handlers/UserHandlers.fs — ASP.NET Core Minimal API Handlers
  ==============================================================

  ASP.NET Core Minimal APIs define HTTP endpoints as functions, not controllers.
  In F# we write these as module-level functions and register them in Program.fs.

  REST endpoints:
    GET    /api/v1/users         → list all users
    GET    /api/v1/users/{id}    → get by username
    POST   /api/v1/users         → create user (validates via Railway)
    PUT    /api/v1/users/{id}    → update user
    DELETE /api/v1/users/{id}    → delete user

  Error mapping:
    DomainError.NotFound        → 404 Not Found
    DomainError.ValidationError → 400 Bad Request
    DomainError.Conflict        → 409 Conflict
    DomainError.Unauthorized    → 401 Unauthorized
*)
module PlaygroundApi.Handlers.UserHandlers

open System
open System.Collections.Concurrent
open Microsoft.AspNetCore.Http
open PlaygroundApi.Domain.Types
open PlaygroundApi.Domain.Validation
open PlaygroundApi.Domain.Railway

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store with seed data
// ─────────────────────────────────────────────────────────────────────────────
// ConcurrentDictionary is thread-safe — important since ASP.NET Core handles
// multiple requests concurrently on the thread pool.

let private store = ConcurrentDictionary<string, User>()

// Seed with sample data
do
    let alice : User = {
        Id = "1"; Username = "alice"; Email = "alice@example.com"
        Name = "Alice Smith"; Role = Admin
        CreatedAt = DateTime.UtcNow.AddDays(-30.0)
        LastAccess = Some (DateTime.UtcNow.AddHours(-1.0))
        RealmIds = ["realm-1"]
    }
    let bob : User = {
        Id = "2"; Username = "bob"; Email = "bob@example.com"
        Name = "Bob Jones"; Role = Contributor
        CreatedAt = DateTime.UtcNow.AddDays(-15.0)
        LastAccess = None; RealmIds = []
    }
    store.TryAdd("alice", alice) |> ignore
    store.TryAdd("bob", bob) |> ignore


// ─────────────────────────────────────────────────────────────────────────────
// DTO for JSON responses
// ─────────────────────────────────────────────────────────────────────────────

type UserResponse = {
    Id:         string
    Username:   string
    Email:      string
    Name:       string
    Role:       string
    CreatedAt:  string
    LastAccess: string option
    RealmIds:   string list
}

let private toResponse (user: User) : UserResponse = {
    Id         = user.Id
    Username   = user.Username
    Email      = user.Email
    Name       = user.Name
    Role       = userRoleToString user.Role
    CreatedAt  = user.CreatedAt.ToString("o")
    LastAccess = user.LastAccess |> Option.map (fun dt -> dt.ToString("o"))
    RealmIds   = user.RealmIds
}

// ─────────────────────────────────────────────────────────────────────────────
// Error → HTTP Result mapping
// ─────────────────────────────────────────────────────────────────────────────

let private errorToResult (err: DomainError) : IResult =
    match err with
    | NotFound entity       -> Results.NotFound({| error = $"Not found: {entity}" |})
    | ValidationError msg   -> Results.BadRequest({| error = msg |})
    | Conflict msg          -> Results.Conflict({| error = msg |})
    | Unauthorized          -> Results.Unauthorized()
    | InvalidTransition (f, t) ->
        Results.BadRequest({| error = $"Invalid transition from {f} to {t}" |})

// ─────────────────────────────────────────────────────────────────────────────
// Handlers — each is a function used by Minimal API route registration
// ─────────────────────────────────────────────────────────────────────────────

/// GET /api/v1/users — list all users
let listUsers () : IResult =
    let users = store.Values |> Seq.map toResponse |> Seq.toList
    Results.Ok users

/// GET /api/v1/users/{username} — get user by username
let getUser (username: string) : IResult =
    match store.TryGetValue(username) with
    | true, user  -> Results.Ok (toResponse user)
    | false, _    -> errorToResult (NotFound $"User '{username}'")

/// POST /api/v1/users — create user from JSON body
let createUser (dto: CreateUserDto) : IResult =
    if store.ContainsKey(dto.Username) then
        errorToResult (Conflict $"Username '{dto.Username}' already exists")
    else
        match validateCreateUser dto with
        | Error e    -> errorToResult e
        | Ok newUser ->
            store.TryAdd(newUser.Username, newUser) |> ignore
            Results.Created($"/api/v1/users/{newUser.Username}", toResponse newUser)

/// PUT /api/v1/users/{username} — update user
let updateUser (username: string) (dto: CreateUserDto) : IResult =
    match store.TryGetValue(username) with
    | false, _ -> errorToResult (NotFound $"User '{username}'")
    | true, existing ->
        match validateRole dto.Role with
        | Error e    -> errorToResult e
        | Ok role    ->
            let updated = { existing with
                                Email = if String.IsNullOrWhiteSpace dto.Email then existing.Email else dto.Email.Trim()
                                Name  = if String.IsNullOrWhiteSpace dto.Name  then existing.Name  else dto.Name.Trim()
                                Role  = role }
            store.[username] <- updated
            Results.Ok (toResponse updated)

/// DELETE /api/v1/users/{username}
let deleteUser (username: string) : IResult =
    match store.TryRemove(username) with
    | true, _  -> Results.NoContent()
    | false, _ -> errorToResult (NotFound $"User '{username}'")
