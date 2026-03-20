(*
  Examples/ComputationExpressions.fs — Monad Syntax Sugar
  =========================================================

  Computation expressions (CE) are F#'s equivalent of Haskell's do-notation
  or Rust's ? operator (but more general). They make monadic code look sequential.

  You've already used CEs without knowing it:
    seq { for i in 1..10 do yield i }    ← seq CE
    async { let! result = fetchData() }  ← async CE
    task { return! dbQuery.ToListAsync() } ← task CE

  We can BUILD our own CEs for any monadic type.

  The magic: inside a CE, `let!` means "unwrap this monad and continue,
  or short-circuit if it's a failure/None". No explicit matching needed.

  Example — WITHOUT result CE (nested match):
    match validateEmail email with
    | Error e -> Error e
    | Ok em ->
        match validateRole role with
        | Error e -> Error e
        | Ok r -> Ok { Email = em; Role = r }

  SAME — WITH result CE (clean pipeline):
    result {
        let! em = validateEmail email
        let! r  = validateRole role
        return { Email = em; Role = r }
    }
*)
module PlaygroundApi.Examples.ComputationExpressions

open System.Threading.Tasks
open PlaygroundApi.Domain.Types

// ─────────────────────────────────────────────────────────────────────────────
// 1. ResultBuilder — CE for Result<'T, 'E>
// ─────────────────────────────────────────────────────────────────────────────
(*
  A CE builder is just a class with specific method names.
  F# calls these methods automatically when it sees CE keywords:
    let!  → Bind
    return → Return
    return! → ReturnFrom
    do!   → Bind (for Result<unit, _>)
    if/for/while → Delay, Combine, For, While
*)

type ResultBuilder() =
    /// let! x = expr  — unwrap Ok or short-circuit on Error
    member _.Bind(result: Result<'a, 'e>, fn: 'a -> Result<'b, 'e>) : Result<'b, 'e> =
        match result with
        | Ok value -> fn value
        | Error e  -> Error e

    /// return expr — wrap value in Ok
    member _.Return(value: 'a) : Result<'a, 'e> = Ok value

    /// return! expr — pass through an existing Result
    member _.ReturnFrom(result: Result<'a, 'e>) : Result<'a, 'e> = result

    /// let x = expr (non-monadic, plain let)
    member _.Zero() : Result<unit, 'e> = Ok ()

    /// Supports `if` without `else` inside CE (returns unit)
    member _.Delay(fn: unit -> Result<'a, 'e>) : Result<'a, 'e> = fn()

    /// do! expr — bind a Result<unit, 'e> (for side effects)
    member _.Bind(result: Result<unit, 'e>, fn: unit -> Result<'b, 'e>) : Result<'b, 'e> =
        match result with
        | Ok ()   -> fn ()
        | Error e -> Error e

    /// try...with inside CE
    member _.TryWith(body: unit -> Result<'a, 'e>, handler: exn -> Result<'a, 'e>) : Result<'a, 'e> =
        try body() with exn -> handler exn

// Create the singleton instance — this is what you put before { }
let result = ResultBuilder()


// ─────────────────────────────────────────────────────────────────────────────
// 2. MaybeBuilder — CE for Option<'T>
// ─────────────────────────────────────────────────────────────────────────────

type MaybeBuilder() =
    member _.Bind(opt: 'a option, fn: 'a -> 'b option) : 'b option =
        match opt with
        | Some value -> fn value
        | None       -> None

    member _.Return(value: 'a) : 'a option = Some value
    member _.ReturnFrom(opt: 'a option) : 'a option = opt
    member _.Zero() : unit option = Some ()

let maybe = MaybeBuilder()


// ─────────────────────────────────────────────────────────────────────────────
// 3. AsyncResultBuilder — The Killer Combination
// ─────────────────────────────────────────────────────────────────────────────
(*
  In real applications, most operations are BOTH:
    async  — they talk to the database, external APIs, file system
    Result — they can succeed or fail with domain errors

  AsyncResult<'T, 'E> = Async<Result<'T, 'E>>
  or with C# Tasks:     Task<Result<'T, 'E>>

  The builder lets you write:
    asyncResult {
        let! user = fetchUserFromDb userId    // Async<Result<User, DomainError>>
        let! realm = validateRealm realmId    // Result<Realm, DomainError> (sync)
        do! checkPermission user realm        // Async<Result<unit, DomainError>>
        return! saveUser { user with Role = Admin }  // Async<Result<User, DomainError>>
    }
*)

/// Alias for Task<Result<'T, 'E>> — the type of most real-world operations
type AsyncResult<'T, 'E> = Task<Result<'T, 'E>>

type AsyncResultBuilder() =
    /// let! x = asyncResult  — await the Task AND unwrap the Result
    member _.Bind(asyncResult: AsyncResult<'a, 'e>, fn: 'a -> AsyncResult<'b, 'e>) : AsyncResult<'b, 'e> =
        task {
            let! result = asyncResult
            match result with
            | Ok value -> return! fn value
            | Error e  -> return Error e
        }

    /// let! x = result  — lift a sync Result into async (bind without awaiting)
    member _.Bind(syncResult: Result<'a, 'e>, fn: 'a -> AsyncResult<'b, 'e>) : AsyncResult<'b, 'e> =
        match syncResult with
        | Ok value -> fn value
        | Error e  -> Task.FromResult(Error e)

    /// return expr — wrap in Task<Ok>
    member _.Return(value: 'a) : AsyncResult<'a, 'e> =
        Task.FromResult(Ok value)

    /// return! expr — pass through existing AsyncResult
    member _.ReturnFrom(asyncResult: AsyncResult<'a, 'e>) : AsyncResult<'a, 'e> =
        asyncResult

    /// do! — await a Task<Result<unit, 'e>>
    member _.Bind(asyncResult: AsyncResult<unit, 'e>, fn: unit -> AsyncResult<'b, 'e>) : AsyncResult<'b, 'e> =
        task {
            let! result = asyncResult
            match result with
            | Ok ()   -> return! fn ()
            | Error e -> return Error e
        }

    member _.Zero() : AsyncResult<unit, 'e> = Task.FromResult(Ok ())

    member _.Delay(fn: unit -> AsyncResult<'a, 'e>) : AsyncResult<'a, 'e> = fn()

let asyncResult = AsyncResultBuilder()


// ─────────────────────────────────────────────────────────────────────────────
// Showcase: same logic, with and without CE
// ─────────────────────────────────────────────────────────────────────────────

open PlaygroundApi.Domain.Validation
open PlaygroundApi.Domain.Railway

// Simulated async database operations
let private findUser (username: string) : AsyncResult<User, DomainError> =
    task {
        // Simulate DB lookup
        do! Task.Delay(1)
        if username = "alice" then
            return Ok {
                Id = "1"; Username = "alice"; Email = "alice@example.com"
                Name = "Alice"; Role = Admin; CreatedAt = System.DateTime.UtcNow
                LastAccess = None; RealmIds = ["realm-1"]
            }
        else
            return Error (NotFound $"User '{username}' not found")
    }

let private saveUser (user: User) : AsyncResult<User, DomainError> =
    task {
        do! Task.Delay(1)  // Simulate DB write
        return Ok user
    }

// ── Without asyncResult CE (deeply nested) ───────────────────────────────────
let promoteToAdminVerbose (username: string) : AsyncResult<User, DomainError> =
    task {
        let! findResult = findUser username
        match findResult with
        | Error e -> return Error e
        | Ok user ->
            if user.Role = Admin then
                return Error (Conflict $"User '{username}' is already an Admin")
            else
                let! saveResult = saveUser { user with Role = Admin }
                match saveResult with
                | Error e      -> return Error e
                | Ok savedUser -> return Ok savedUser
    }

// ── WITH asyncResult CE (clean and readable) ─────────────────────────────────
let promoteToAdmin (username: string) : AsyncResult<User, DomainError> =
    asyncResult {
        // let! unwraps Task<Result<User, _>> — awaits AND pattern-matches
        let! user = findUser username

        // return! with conditional — single expression, no Combine needed
        return!
            if user.Role = Admin then
                Task.FromResult(Error (Conflict $"User '{username}' is already an Admin"))
            else
                saveUser { user with Role = Admin }
    }

// ── maybe CE example ─────────────────────────────────────────────────────────
let private getLastLogin (user: User) : string option =
    maybe {
        let! lastAccess = user.LastAccess  // short-circuits if None
        // We have a DateTime — format it
        return lastAccess.ToString("yyyy-MM-dd HH:mm:ss")
    }

// ── result CE example ─────────────────────────────────────────────────────────
let validateAndCreateUser (dto: CreateUserDto) : Result<User, DomainError> =
    result {
        // Each let! validates and short-circuits if invalid
        let! username = validateUsername dto.Username
        let! email    = validateEmail dto.Email
        let! role     = validateRole dto.Role

        // Plain let (no !) — synchronous, infallible computation
        let id = System.Guid.NewGuid().ToString()

        return {
            Id = id; Username = username; Email = email
            Name = dto.Name.Trim(); Role = role
            CreatedAt = System.DateTime.UtcNow
            LastAccess = None; RealmIds = dto.RealmIds
        }
    }
