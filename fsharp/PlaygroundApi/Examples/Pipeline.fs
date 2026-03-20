(*
  Examples/Pipeline.fs — The |> Operator and Function Composition
  ================================================================

  F# pipelines are one of the language's defining features.
  They express data transformation as readable left-to-right prose.

  The pipe-forward operator |> is just function application reversed:
    f x        ≡ x |> f
    g (f x)    ≡ x |> f |> g
    h (g (f x)) ≡ x |> f |> g |> h

  Why this matters:
    Nested:   filter isActive (map toDto (sort users))   ← hard to read: inner-to-outer
    Pipeline: users |> sort |> map toDto |> filter isActive  ← natural left-to-right

  The >> operator composes TWO functions into one:
    (f >> g) x = g (f x)
    Both take one argument. Use when you want to build a pipeline as a value.
*)
module PlaygroundApi.Examples.Pipeline

open System
open PlaygroundApi.Domain.Types

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic |> Pipelines
// ─────────────────────────────────────────────────────────────────────────────

/// Find the most recently active admin user
let findMostRecentAdmin (users: User list) : User option =
    users
    |> List.filter (fun u -> u.Role = Admin)          // Keep admins
    |> List.filter (fun u -> not u.RealmIds.IsEmpty)  // With realm assignments
    |> List.sortByDescending (fun u ->                 // Most recent first
        u.LastAccess |> Option.defaultValue DateTime.MinValue)
    |> List.tryHead                                    // First element or None

/// Count tasks by status for a given user
let taskSummary (uid: string) (tasks: Task list) : Map<string, int> =
    tasks
    |> List.filter (fun t -> t.Uid = uid)
    |> List.groupBy (fun t -> taskStatusToString t.Status)
    |> List.map (fun (status, group) -> status, List.length group)
    |> Map.ofList

// ─────────────────────────────────────────────────────────────────────────────
// 2. Function Composition with >>
// ─────────────────────────────────────────────────────────────────────────────
(*
  >> builds a new function from two functions:
    (f >> g) : 'a -> 'c   where f: 'a->'b and g: 'b->'c

  Use >> when you want to capture a pipeline as a reusable value.
  Use |> when you're applying a pipeline to a specific value right now.
*)

// Individual transformation functions
let onlyActive (users: User list) : User list = List.filter (fun u -> not u.RealmIds.IsEmpty) users
let adminsOnly (users: User list) : User list = List.filter (fun u -> u.Role = Admin) users
let sortByName (users: User list) : User list = List.sortBy (fun u -> u.Name) users
let limitTo n   (users: User list) : User list = List.truncate n users

// Compose into a pipeline VALUE (not applied to data yet)
// This is a function User list -> User list
let topAdminPipeline : User list -> User list =
    adminsOnly >> onlyActive >> sortByName >> limitTo 10

// Apply it:
// let top10Admins = allUsers |> topAdminPipeline
// OR equivalently:
// let top10Admins = topAdminPipeline allUsers


// ─────────────────────────────────────────────────────────────────────────────
// 3. Partial Application
// ─────────────────────────────────────────────────────────────────────────────
(*
  In F#, ALL functions are curried by default.
  A function of N arguments is really a function that returns a function:

    let add x y = x + y
    // Type: int -> int -> int
    // Calling with ONE arg: let add5 = add 5  // Type: int -> int
    //                       add5 3 = 8

  Partial application: calling a multi-arg function with FEWER args than it expects.
  The result is a new function waiting for the remaining args.

  Why this enables beautiful pipelines:
    List.filter (fun u -> u.Role = Admin)  ← explicit lambda
    List.filter isAdmin                     ← partially applied (cleaner)

  Where isAdmin = fun u -> u.Role = Admin
*)

let isAdmin      : User -> bool = fun u -> u.Role = Admin
let isContributor: User -> bool = fun u -> u.Role = Contributor
let isInRealm (realmId: string) : User -> bool = fun u -> List.contains realmId u.RealmIds

// Partially applying List.filter creates reusable filter pipelines
let filterAdmins      = List.filter isAdmin
let filterContributors= List.filter isContributor
let filterByRealm rid = List.filter (isInRealm rid)

// Now these compose naturally:
let adminsByRealm (realmId: string) (users: User list) : User list =
    users
    |> filterAdmins
    |> filterByRealm realmId
    |> List.sortBy (fun u -> u.Name)


// ─────────────────────────────────────────────────────────────────────────────
// 4. Point-Free Style
// ─────────────────────────────────────────────────────────────────────────────
(*
  "Point-free" means defining functions WITHOUT mentioning their arguments.
  It reads as: "this is a transformation" rather than "take x and transform x".

  Point-free works best when functions compose cleanly (same type in/out).
  Don't force it — use it where it genuinely reads better.
*)

// Point-FULL style (explicit argument):
let countAdminsFull (users: User list) : int =
    users |> List.filter isAdmin |> List.length

// Point-FREE style (no argument named):
let countAdmins : User list -> int =
    List.filter isAdmin >> List.length

// Both are equivalent. Point-free is better when defining combinators.


// ─────────────────────────────────────────────────────────────────────────────
// 5. Full Business Logic Pipeline
// ─────────────────────────────────────────────────────────────────────────────
(*
  "Get all Admin users in active realms, grouped by realm, sorted by user count desc"
  Written as a pipeline that reads like a specification.
*)

type RealmAdminGroup = {
    RealmId:    string
    AdminCount: int
    Admins:     User list
}

let getRealmAdminGroups (users: User list) : RealmAdminGroup list =
    users
    |> List.filter isAdmin                            // 1. Keep admins only
    |> List.filter (fun u -> not u.RealmIds.IsEmpty) // 2. Assigned to a realm
    |> List.collect (fun u ->                         // 3. Flatten: user → (realm, user) pairs
        u.RealmIds |> List.map (fun rid -> (rid, u)))
    |> List.groupBy fst                              // 4. Group by realm ID
    |> List.map (fun (realmId, pairs) ->             // 5. Build summary per group
        let admins = pairs |> List.map snd
        { RealmId = realmId; AdminCount = List.length admins; Admins = admins })
    |> List.sortByDescending (fun g -> g.AdminCount) // 6. Most admins first

// Compare: SAME logic written imperatively
let getRealmAdminGroupsImperative (users: User list) : RealmAdminGroup list =
    // Step 1: filter
    let admins = users |> List.filter (fun u -> u.Role = Admin && not u.RealmIds.IsEmpty)

    // Step 2: build (realm, user) pairs
    let pairs = ResizeArray<string * User>()
    for user in admins do
        for realmId in user.RealmIds do
            pairs.Add((realmId, user))

    // Step 3: group by realm
    let groups = System.Collections.Generic.Dictionary<string, ResizeArray<User>>()
    for (realmId, user) in pairs do
        if not (groups.ContainsKey(realmId)) then
            groups.[realmId] <- ResizeArray<User>()
        groups.[realmId].Add(user)

    // Step 4: build result and sort
    [ for kvp in groups do
        yield { RealmId = kvp.Key; AdminCount = kvp.Value.Count; Admins = kvp.Value |> Seq.toList } ]
    |> List.sortByDescending (fun g -> g.AdminCount)

// The pipeline version is shorter, clearer, and each step is independently testable.
