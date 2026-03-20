(*
  Examples/ActivePatterns.fs — Extensible Pattern Matching
  ==========================================================

  Standard pattern matching works on data SHAPE:
    match x with
    | 0 -> "zero"
    | n when n > 0 -> "positive"
    | _ -> "negative"

  Active patterns let you match on computed PROPERTIES — pattern matching as a function.
  They extend the pattern syntax to custom logic without changing the data structure.

  Types of active patterns:
    (|A|B|)        — Complete: value is always one of the cases
    (|A|_|)        — Partial: may not match (returns option — the _ means "or nothing")
    (|A|B|C|D|E|)  — Multi-case: complete with many cases (max 7 cases)
    (|A|) args     — Parameterized: takes arguments alongside the value

  Syntax: active patterns are just functions with a special name surrounded by (| |)
*)
module PlaygroundApi.Examples.ActivePatterns

open System
open System.Text.RegularExpressions
open PlaygroundApi.Domain.Types

// ─────────────────────────────────────────────────────────────────────────────
// 1. Complete Active Patterns — always matches one case
// ─────────────────────────────────────────────────────────────────────────────
(*
  Like a regular discriminated union — exhaustive, must handle all cases.
  Useful for categorization where every value falls into some category.
*)

/// Classify an integer as Even or Odd
let (|Even|Odd|) (n: int) =
    if n % 2 = 0 then Even else Odd

// Usage:
let describeNumber n =
    match n with
    | Even -> $"{n} is even"
    | Odd  -> $"{n} is odd"
// describeNumber 4 = "4 is even"
// describeNumber 7 = "7 is odd"


// ─────────────────────────────────────────────────────────────────────────────
// 2. Partial Active Patterns — may or may not match
// ─────────────────────────────────────────────────────────────────────────────
(*
  Returns Some(value) if it matches, None otherwise.
  The `_` in (|A|_|) means "or no match".
  Combine multiple partial patterns in a single match expression.
*)

/// Match and extract valid email addresses
let (|Email|_|) (input: string) =
    if Regex.IsMatch(input, @"^[^@\s]+@[^@\s]+\.[^@\s]+$") then
        Some (input.ToLowerInvariant())
    else
        None

/// Match and extract valid UUIDs
let (|Uuid|_|) (input: string) =
    match Guid.TryParse(input) with
    | true, guid -> Some guid
    | false, _   -> None

/// Match positive integers
let (|PositiveInt|_|) (input: string) =
    match Int32.TryParse(input) with
    | true, n when n > 0 -> Some n
    | _                  -> None


// ─────────────────────────────────────────────────────────────────────────────
// 3. HTTP Status Categorization — multi-case complete
// ─────────────────────────────────────────────────────────────────────────────
(*
  This is more readable than:
    if status >= 200 && status < 300 then ...
    elif status >= 300 && status < 400 then ...
    ...
*)

type HttpCategory = Success | Redirect | ClientError | ServerError

let (|HttpSuccess|HttpRedirect|HttpClientError|HttpServerError|) (status: int) =
    if   status >= 200 && status < 300 then HttpSuccess
    elif status >= 300 && status < 400 then HttpRedirect
    elif status >= 400 && status < 500 then HttpClientError
    else                                    HttpServerError

let describeHttpStatus status =
    match status with
    | HttpSuccess     -> $"{status}: OK — request succeeded"
    | HttpRedirect    -> $"{status}: Redirect — follow the Location header"
    | HttpClientError -> $"{status}: Client error — fix your request"
    | HttpServerError -> $"{status}: Server error — try again later"

// describeHttpStatus 200 = "200: OK — request succeeded"
// describeHttpStatus 404 = "404: Client error — fix your request"
// describeHttpStatus 503 = "503: Server error — try again later"


// ─────────────────────────────────────────────────────────────────────────────
// 4. Domain Authorization — parameterized partial pattern
// ─────────────────────────────────────────────────────────────────────────────
(*
  Parameterized patterns take arguments. They're functions from parameters to
  (value -> result option). Great for authorization checks or contextual parsing.
*)

/// Check if a user has at least the given role.
/// Parameterized: (|HasRole|_|) minimumRole user
let (|HasRole|_|) (minimumRole: UserRole) (user: User) =
    let roleLevel = function
        | Admin       -> 3
        | Contributor -> 2
        | ReadOnly    -> 1
    if roleLevel user.Role >= roleLevel minimumRole then Some user else None

/// Check if a user belongs to a specific realm.
let (|InRealm|_|) (realmId: string) (user: User) =
    if List.contains realmId user.RealmIds then Some user else None

// Usage in authorization checks:
let canDeleteRealm (user: User) (realmId: string) : bool =
    match user with
    | HasRole Admin (InRealm realmId _) -> true  // Admin AND in the realm
    | HasRole Admin _                   -> true  // Any Admin can delete
    | _                                 -> false


// ─────────────────────────────────────────────────────────────────────────────
// 5. Task Status Parser — practical string parsing
// ─────────────────────────────────────────────────────────────────────────────

/// Parse "InProgress:alice" into InProgress("alice"), etc.
let (|ParsedTaskStatus|_|) (input: string) : TaskStatus option =
    match input.Split(':') with
    | [| "Pending" |]                                                    -> Some Pending
    | [| "Done" |]                                                       -> Some (Done DateTime.UtcNow)
    | [| "InProgress"; assignee |] when not (String.IsNullOrWhiteSpace assignee) ->
        Some (InProgress (assignee.Trim()))
    | [| "Cancelled"; reason |] when not (String.IsNullOrWhiteSpace reason)  ->
        Some (Cancelled (reason.Trim()))
    | _                                                                  -> None


// ─────────────────────────────────────────────────────────────────────────────
// 6. Comparison: if/elif chains vs active patterns
// ─────────────────────────────────────────────────────────────────────────────

// WITHOUT active patterns — imperative style
let describeUserVerbose (user: User) =
    if user.Role = Admin && List.length user.RealmIds > 0 then
        $"Admin with {List.length user.RealmIds} realm(s)"
    elif user.Role = Admin then
        "Admin with no realms"
    elif user.Role = Contributor then
        "Contributor"
    else
        "Read-only user"

// WITH active patterns — declarative style
let (|MultiRealmAdmin|SingleRealmAdmin|NoRealmAdmin|NonAdmin|) (user: User) =
    match user.Role, List.length user.RealmIds with
    | Admin, n when n > 1 -> MultiRealmAdmin n
    | Admin, 1            -> SingleRealmAdmin (List.head user.RealmIds)
    | Admin, _            -> NoRealmAdmin
    | _,     _            -> NonAdmin user.Role

let describeUser (user: User) =
    match user with
    | MultiRealmAdmin n          -> $"Admin across {n} realms"
    | SingleRealmAdmin realmId   -> $"Admin of realm '{realmId}'"
    | NoRealmAdmin               -> "Admin with no realm assignment"
    | NonAdmin Contributor       -> "Contributor"
    | NonAdmin ReadOnly          -> "Read-only user"
    | NonAdmin _                 -> "Unknown role"


// ─────────────────────────────────────────────────────────────────────────────
// 7. Showcase: combining multiple patterns
// ─────────────────────────────────────────────────────────────────────────────

/// Parse an API request "id" field — could be email, UUID, or username
type IdentifierKind =
    | ByEmail    of string
    | ByUuid     of Guid
    | ByUsername of string

let parseIdentifier (input: string) : IdentifierKind =
    match input with
    | Email email     -> ByEmail email     // Matches email pattern
    | Uuid  guid      -> ByUuid guid       // Matches UUID pattern
    | username        -> ByUsername username // Fallback: treat as username

// Example:
// parseIdentifier "alice@example.com" = ByEmail "alice@example.com"
// parseIdentifier "550e8400-e29b-41d4-a716-446655440000" = ByUuid (...)
// parseIdentifier "alice" = ByUsername "alice"

let resolveUser (store: Map<string, User>) (identifier: string) : User option =
    match parseIdentifier identifier with
    | ByEmail email    -> store |> Map.tryFindKey (fun _ u -> u.Email = email)
                                |> Option.bind (fun k -> store.TryFind k)
    | ByUuid guid      -> store |> Map.values |> Seq.tryFind (fun u -> u.Id = string guid)
    | ByUsername name  -> store.TryFind name
