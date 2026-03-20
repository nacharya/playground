(*
  Domain/Validation.fs — Input Validation using Railway
  ======================================================

  Validation functions follow the pattern: 'a -> Result<'b, DomainError>
  They compose with |> and Railway operators into clean validation pipelines.

  Design principles:
    1. Validate at the boundary (when data enters from outside)
    2. Inside the domain, trust the types (UserRole, not string)
    3. Return ALL errors when possible (not just the first one)
    4. Never throw exceptions — return Result<_, DomainError>
*)
module PlaygroundApi.Domain.Validation

open System
open System.Text.RegularExpressions
open PlaygroundApi.Domain.Types
open PlaygroundApi.Domain.Railway

// ─────────────────────────────────────────────────────────────────────────────
// Primitive validators
// ─────────────────────────────────────────────────────────────────────────────

/// Validate that a string is not null or empty
let validateNotEmpty (fieldName: string) (value: string) : Result<string, DomainError> =
    if String.IsNullOrWhiteSpace(value) then
        Error (ValidationError $"{fieldName} cannot be empty")
    else
        Ok (value.Trim())

/// Validate string length is within bounds
let validateLength (fieldName: string) (minLen: int) (maxLen: int) (value: string) : Result<string, DomainError> =
    if value.Length < minLen then
        Error (ValidationError $"{fieldName} must be at least {minLen} characters")
    elif value.Length > maxLen then
        Error (ValidationError $"{fieldName} must be at most {maxLen} characters")
    else
        Ok value

/// Validate that a string matches a regex pattern
let validatePattern (fieldName: string) (pattern: string) (value: string) : Result<string, DomainError> =
    if Regex.IsMatch(value, pattern) then
        Ok value
    else
        Error (ValidationError $"{fieldName} has an invalid format")

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific validators
// ─────────────────────────────────────────────────────────────────────────────

/// Validate an email address
/// Result<string, DomainError> — returns the normalized (lowercased) email
let validateEmail (email: string) : Result<string, DomainError> =
    email
    |> validateNotEmpty "Email"
    >>= validatePattern "Email" @"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    |> map (fun e -> e.ToLowerInvariant())  // Normalize to lowercase

/// Validate a username: 3-30 chars, alphanumeric + hyphens/underscores
let validateUsername (username: string) : Result<string, DomainError> =
    username
    |> validateNotEmpty "Username"
    >>= validateLength "Username" 3 30
    >>= validatePattern "Username" @"^[a-zA-Z0-9_-]+$"
    |> map (fun u -> u.ToLowerInvariant())

/// Parse a string into a UserRole DU.
/// This is the bridge between "stringly typed" API input and our domain types.
let validateRole (roleStr: string) : Result<UserRole, DomainError> =
    match roleStr.Trim().ToLowerInvariant() with
    | "admin"       -> Ok Admin
    | "contributor" -> Ok Contributor
    | "readonly"    -> Ok ReadOnly
    | other         -> Error (ValidationError $"Unknown role '{other}'. Valid: Admin, Contributor, ReadOnly")

/// Parse a string into a RealmType DU.
let validateRealmType (typeStr: string) : Result<RealmType, DomainError> =
    match typeStr.Trim().ToUpperInvariant() with
    | "AD"          -> Ok AD
    | "AZURE"       -> Ok Azure
    | "AWS"         -> Ok AWS
    | "LDAP"        -> Ok LDAP
    | "USERSHARED"  -> Ok UserShared
    | other         -> Error (ValidationError $"Unknown realm type '{other}'. Valid: AD, AZURE, AWS, LDAP, UserShared")

/// Parse a TaskStatus transition.
/// Format: "Pending", "InProgress:alice", "Done", "Cancelled:reason"
let parseTaskStatus (statusStr: string) : Result<TaskStatus, DomainError> =
    match statusStr.Split(':') with
    | [| "Pending" |]    -> Ok Pending
    | [| "Done" |]       -> Ok (Done DateTime.UtcNow)
    | [| "InProgress"; assignee |] when not (String.IsNullOrWhiteSpace assignee) ->
        Ok (InProgress (assignee.Trim()))
    | [| "Cancelled"; reason |] when not (String.IsNullOrWhiteSpace reason) ->
        Ok (Cancelled (reason.Trim()))
    | _ ->
        Error (ValidationError $"Invalid status '{statusStr}'. Format: Pending | InProgress:assignee | Done | Cancelled:reason")

/// Validate a state machine transition.
/// Not all transitions are valid — this enforces the task workflow.
let validateTaskTransition (currentStatus: TaskStatus) (newStatus: TaskStatus) : Result<TaskStatus, DomainError> =
    match currentStatus, newStatus with
    | Pending,      InProgress _ -> Ok newStatus  // Pending → InProgress: allowed
    | InProgress _, Done _       -> Ok newStatus  // InProgress → Done: allowed
    | _,            Cancelled _  -> Ok newStatus  // Any → Cancelled: always allowed
    | _,            Pending      -> Error (InvalidTransition ("any", "Pending"))  // Can't go back to Pending
    | Done _,       _            -> Error (InvalidTransition ("Done", taskStatusToString newStatus))
    | Cancelled _,  _            -> Error (InvalidTransition ("Cancelled", taskStatusToString newStatus))
    | from,         ``to``       -> Error (InvalidTransition (taskStatusToString from, taskStatusToString ``to``))

// ─────────────────────────────────────────────────────────────────────────────
// Composite validators — validate entire DTOs
// ─────────────────────────────────────────────────────────────────────────────

/// Validate a CreateUserDto and return a typed User domain object.
/// This pipeline shows how Railway operators compose multiple validators.
let validateCreateUser (dto: CreateUserDto) : Result<User, DomainError> =
    // Use result computation expression for cleaner syntax (see ComputationExpressions.fs)
    // For now, using explicit bind chains to show the railway mechanics:
    dto.Username |> validateUsername >>= fun username ->
    dto.Email    |> validateEmail    >>= fun email ->
    dto.Role     |> validateRole     >>= fun role ->
    Ok {
        Id         = Guid.NewGuid().ToString()
        Username   = username
        Email      = email
        Name       = dto.Name.Trim()
        Role       = role
        CreatedAt  = DateTime.UtcNow
        LastAccess = None
        RealmIds   = dto.RealmIds
    }

/// Validate a CreateRealmDto and return a typed Realm domain object.
let validateCreateRealm (dto: CreateRealmDto) : Result<Realm, DomainError> =
    dto.Name |> validateNotEmpty "Name" >>= fun name ->
    dto.Type |> validateRealmType       >>= fun realmType ->
    dto.Owner |> validateNotEmpty "Owner" >>= fun owner ->
    Ok {
        Id           = Guid.NewGuid().ToString()
        Name         = name.ToLowerInvariant()
        Active       = true
        Type         = realmType
        Owner        = owner
        Tenant       = dto.Tenant.Trim()
        AuthProvider = dto.AuthProvider.Trim()
    }

/// Validate a CreateTaskDto
let validateCreateTask (dto: CreateTaskDto) : Result<Task, DomainError> =
    dto.Name |> validateNotEmpty "Name" >>= fun name ->
    dto.Uid  |> validateNotEmpty "UID"  >>= fun uid ->
    let due =
        match dto.Due with
        | Some s ->
            match DateTime.TryParse(s) with
            | true, dt -> Ok (Some dt)
            | _        -> Error (ValidationError $"Invalid date format: '{s}'")
        | None -> Ok None
    due >>= fun dueDate ->
    Ok {
        Id     = Guid.NewGuid().ToString()
        Name   = name
        Text   = dto.Text.Trim()
        Uid    = uid
        Status = Pending
        Due    = dueDate
    }
