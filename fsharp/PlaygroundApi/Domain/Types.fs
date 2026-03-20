(*
  Domain/Types.fs — F# Type System Showcase
  ==========================================

  F#'s type system is expressive enough to make illegal states unrepresentable.
  The compiler enforces domain invariants so runtime errors become impossible.

  Core philosophy: "Make illegal states unrepresentable"
    Instead of: type User = { Role: string }  // "Admin", "Typo", "" all valid at runtime
    Use:         type User = { Role: UserRole } // Compiler enforces valid values

  Key F# type concepts shown here:
    Discriminated Unions (DU) — sum types: a value IS one of several cases
    Record types              — product types: a value HAS all of its fields
    Option<'T>                — explicit nullable (no null reference exceptions)
    Result<'T,'E>             — explicit error handling (no hidden exceptions)
*)
module PlaygroundApi.Domain.Types

open System

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated Unions — The Crown Jewel of F# Types
// ─────────────────────────────────────────────────────────────────────────────
(*
  A Discriminated Union is a type that can be ONE of several named cases.
  This is called a "sum type" — the total number of possible values is the
  sum of the possible values of each case.

  Key insight: Pattern matching on a DU is EXHAUSTIVE — the compiler tells you
  if you haven't handled all cases. This is impossible with string comparisons
  or enums in most languages.
*)

/// The type of authentication provider for a realm.
/// Using a DU instead of string "AD" prevents typos and enables exhaustive matching.
type RealmType =
    | AD            // Active Directory
    | Azure         // Azure Active Directory / Entra ID
    | AWS           // AWS IAM Identity Center
    | LDAP          // Generic LDAP
    | UserShared    // Shared user pool (no external provider)

/// User permission level within the system.
type UserRole =
    | Admin         // Full CRUD on all resources
    | Contributor   // Can read and write, cannot admin
    | ReadOnly      // Read-only access

(*
  TaskStatus is a STATE MACHINE encoded in the type system.

  Legal transitions:
    Pending → InProgress(assignee)
    InProgress(assignee) → Done(completedAt)
    Any state → Cancelled(reason)

  Impossible by construction:
    - A Done task cannot become Pending (no transition exists)
    - InProgress requires an assignee (it's part of the case data)
    - Cancellation always requires a reason (forces developers to be explicit)

  Notice: some cases carry data (InProgress of string, Done of DateTime).
  This is called a "tagged union with payload" and is more expressive than
  traditional enums which can only carry primitive values.
*)
type TaskStatus =
    | Pending
    | InProgress  of assignee: string
    | Done        of completedAt: DateTime
    | Cancelled   of reason: string

// ─────────────────────────────────────────────────────────────────────────────
// Error types — also a DU
// ─────────────────────────────────────────────────────────────────────────────
(*
  Instead of throwing exceptions (which are invisible in function signatures),
  we return DomainError values. The function signature tells callers what can go wrong.

  Compare:
    C#:  User GetUser(string id) { ... throws KeyNotFoundException ... }
    F#:  let getUser id : Result<User, DomainError> = ...

  The F# version makes errors part of the contract. Callers can't ignore them.
*)
type DomainError =
    | NotFound        of entity: string   // "User 'alice' not found"
    | ValidationError of message: string  // "Email cannot be empty"
    | Unauthorized                        // No payload needed
    | Conflict        of message: string  // "Username 'alice' already exists"
    | InvalidTransition of from: string * ``to``: string  // State machine violation

// ─────────────────────────────────────────────────────────────────────────────
// Record Types — Immutable by Default
// ─────────────────────────────────────────────────────────────────────────────
(*
  F# records are like immutable data classes. They have:
    - Structural equality: two records are equal if all fields are equal
    - Copy-and-update syntax: { user with Role = Admin } creates a new record
    - Automatically generated ToString, GetHashCode, Equals
    - Pattern matching support

  Immutability is the default. To update a field, you create a new record.
  This eliminates a whole class of bugs (accidental mutation, threading issues).
*)

/// A realm is an authentication/authorization boundary.
/// Users and Apps belong to one or more realms.
type Realm = {
    Id:           string
    Name:         string      // One-word identifier
    Active:       bool
    Type:         RealmType   // Typed DU, not string!
    Owner:        string      // Username of the owner
    Tenant:       string      // Human-readable description
    AuthProvider: string      // e.g., "Auth0", "Azure AD B2C"
}

/// An application registered in the system.
type App = {
    Id:       string
    Name:     string
    Active:   bool
    RealmIds: string list     // F# lists are immutable linked lists
}

/// A user who can access apps within realms.
type User = {
    Id:         string
    Username:   string
    Email:      string
    Name:       string
    Role:       UserRole      // Typed DU, not string!
    CreatedAt:  DateTime
    LastAccess: DateTime option  // option<T> is F#'s null-safe nullable
    RealmIds:   string list
}

/// A unit of work assigned to a user.
/// Notice: TaskStatus encodes the entire state machine in the type.
type Task = {
    Id:     string
    Name:   string
    Text:   string
    Uid:    string            // Assigned user ID
    Status: TaskStatus        // Typed DU, not bool completed!
    Due:    DateTime option
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs — Data Transfer Objects (API input/output shapes)
// ─────────────────────────────────────────────────────────────────────────────
(*
  DTOs use strings for everything (from JSON). Validation converts them
  to the typed domain types above. This keeps the domain pure and validation
  at the system boundary.
*)

type CreateUserDto = {
    Username:   string
    Email:      string
    Name:       string
    Role:       string    // Will be validated → UserRole
    RealmIds:   string list
}

type CreateRealmDto = {
    Name:         string
    Type:         string  // Will be validated → RealmType
    Owner:        string
    Tenant:       string
    AuthProvider: string
}

type CreateTaskDto = {
    Name:  string
    Text:  string
    Uid:   string
    Due:   string option  // ISO 8601 string, will be parsed
}

type UpdateTaskStatusDto = {
    TaskId:   string
    NewStatus: string      // "InProgress:alice", "Done", "Cancelled:reason"
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: display TaskStatus as a readable string
// ─────────────────────────────────────────────────────────────────────────────

let taskStatusToString (status: TaskStatus) : string =
    match status with
    | Pending              -> "Pending"
    | InProgress assignee  -> sprintf "InProgress:%s" assignee
    | Done completedAt     -> sprintf "Done:%s" (completedAt.ToString("yyyy-MM-dd"))
    | Cancelled reason     -> sprintf "Cancelled:%s" reason

let userRoleToString (role: UserRole) : string =
    match role with
    | Admin       -> "Admin"
    | Contributor -> "Contributor"
    | ReadOnly    -> "ReadOnly"

let realmTypeToString (rt: RealmType) : string =
    match rt with
    | AD         -> "AD"
    | Azure      -> "AZURE"
    | AWS        -> "AWS"
    | LDAP       -> "LDAP"
    | UserShared -> "UserShared"
