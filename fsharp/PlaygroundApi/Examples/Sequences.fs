(*
  Examples/Sequences.fs — Lazy Evaluation with F# Sequences
  ===========================================================

  `seq<'T>` (= IEnumerable<'T>) is F#'s lazy sequence type.
  Elements are computed ON DEMAND — not all at once.

  Lazy vs Eager:
    List  — eager: all elements computed immediately, stored in memory
    Array — eager: all elements computed immediately, stored contiguously
    Seq   — lazy: elements computed one at a time as consumed

  Why laziness matters:
    - Infinite sequences (Fibonacci, natural numbers, prime stream)
    - Memory-efficient large file processing (never load everything)
    - Early termination: Seq.take 10 on an infinite seq works fine;
      the same on a List would never terminate

  Key Seq functions:
    Seq.unfold   — generate a lazy sequence from a state machine
    Seq.windowed — sliding windows over a sequence
    Seq.pairwise — consecutive pairs: [(a,b); (b,c); (c,d)]
    Seq.groupBy  — group elements by a key function
    Seq.scan     — like fold but yields intermediate accumulator values
*)
module PlaygroundApi.Examples.Sequences

open PlaygroundApi.Domain.Types

// ─────────────────────────────────────────────────────────────────────────────
// 1. Infinite Sequences with Seq.unfold
// ─────────────────────────────────────────────────────────────────────────────
(*
  Seq.unfold generates a sequence from a seed value.
  The generator function returns:
    Some (nextElement, nextState) — continue sequence with this element + state
    None                         — stop the sequence

  Because the sequence is lazy, you MUST use Seq.take or Seq.head to terminate it.
  Trying to convert an infinite seq to a list with Seq.toList will hang forever.
*)

/// Infinite Fibonacci sequence using Seq.unfold
/// State is a pair (current, next). Generator yields current, advances state.
let fibonacci : seq<int64> =
    Seq.unfold
        (fun (current, next) -> Some (current, (next, current + next)))
        (0L, 1L)  // Seed: fib(0)=0, fib(1)=1

// Examples:
// fibonacci |> Seq.take 10 |> Seq.toList = [0;1;1;2;3;5;8;13;21;34]
// fibonacci |> Seq.item 50 = (50th Fibonacci number)

/// Natural numbers starting from n
let naturalsFrom (n: int) : seq<int> =
    Seq.unfold (fun i -> Some (i, i + 1)) n

/// Powers of 2: 1, 2, 4, 8, 16, ...
let powersOfTwo : seq<int> =
    Seq.unfold (fun n -> Some (n, n * 2)) 1


// ─────────────────────────────────────────────────────────────────────────────
// 2. Sliding Window Average
// ─────────────────────────────────────────────────────────────────────────────
(*
  Seq.windowed n creates overlapping windows of size n:
    [1;2;3;4;5] |> Seq.windowed 3 = [[|1;2;3|]; [|2;3;4|]; [|3;4;5|]]

  Perfect for: moving averages, anomaly detection, sliding statistics.
*)

/// Compute a sliding average over a sequence of floats.
/// Windows smaller than windowSize (at the start) are skipped.
let slidingAverage (windowSize: int) (values: seq<float>) : seq<float> =
    values
    |> Seq.windowed windowSize
    |> Seq.map (fun window -> Array.average window)

// Example: [10.0; 20.0; 30.0; 40.0] |> slidingAverage 3 = [20.0; 30.0]


// ─────────────────────────────────────────────────────────────────────────────
// 3. Run-Length Encoding with Seq.pairwise
// ─────────────────────────────────────────────────────────────────────────────
(*
  Run-length encoding compresses consecutive duplicates:
    "AAABBBCCA" → [(A,3); (B,3); (C,2); (A,1)]

  Seq.pairwise gives consecutive pairs: [a;b;c] → [(a,b);(b,c)]
  Use it to detect where consecutive elements differ.
*)

/// Compress consecutive equal elements: [1;1;2;2;2;3] → [(1,2);(2,3);(3,1)]
let runLengthEncode (sequence: seq<'a>) : seq<'a * int> when 'a : equality =
    sequence
    |> Seq.fold
        (fun acc item ->
            match acc with
            | (current, count) :: rest when current = item ->
                (current, count + 1) :: rest   // Extend current run
            | _ ->
                (item, 1) :: acc               // Start new run
        )
        []
    |> List.rev   // Fold builds in reverse
    |> List.toSeq


// ─────────────────────────────────────────────────────────────────────────────
// 4. Chunking
// ─────────────────────────────────────────────────────────────────────────────

/// Split a sequence into chunks of at most `size` elements.
/// The last chunk may be smaller if the input length isn't divisible by size.
let chunkBy (size: int) (sequence: seq<'a>) : seq<'a list> =
    sequence
    |> Seq.chunkBySize size
    |> Seq.map Array.toList


// ─────────────────────────────────────────────────────────────────────────────
// 5. Full Business Logic Pipeline
// ─────────────────────────────────────────────────────────────────────────────
(*
  This is where F# sequences shine: expressive data transformation pipelines
  that read like English prose.

  Task: "Get all Admin users in active realms, sorted by last access desc"
*)

/// Summary of user activity per realm
type RealmUserSummary = {
    RealmId:   string
    UserCount: int
    AdminCount: int
    LastActivity: System.DateTime option
}

/// Count users per realm and summarize activity.
/// Demonstrates: groupBy, map over groups, Seq composition
let summarizeRealmActivity (users: User seq) : RealmUserSummary seq =
    users
    |> Seq.filter (fun u -> not u.RealmIds.IsEmpty)  // Only users in at least one realm
    |> Seq.collect (fun u -> u.RealmIds |> Seq.map (fun rid -> (rid, u)))  // Flatten: user → (realmId, user) pairs
    |> Seq.groupBy fst  // Group by realm ID
    |> Seq.map (fun (realmId, pairs) ->
        let realmUsers = pairs |> Seq.map snd |> Seq.toList
        {
            RealmId    = realmId
            UserCount  = List.length realmUsers
            AdminCount = realmUsers |> List.filter (fun u -> u.Role = Admin) |> List.length
            LastActivity =
                realmUsers
                |> List.choose (fun u -> u.LastAccess)
                |> function [] -> None | xs -> Some (List.max xs)
        }
    )
    |> Seq.sortByDescending (fun s -> s.UserCount)

/// Get admin users sorted by last access (most recent first)
let getActiveAdmins (users: User seq) : User list =
    users
    |> Seq.filter (fun u -> u.Role = Admin)         // Only admins
    |> Seq.filter (fun u -> not u.RealmIds.IsEmpty) // With realm assignments
    |> Seq.sortByDescending (fun u ->               // Sort by last access
        match u.LastAccess with
        | Some dt -> dt
        | None    -> System.DateTime.MinValue
    )
    |> Seq.toList

/// Compute cumulative task completion statistics over time
/// Uses Seq.scan to accumulate state across the sequence
let computeCompletionRate (tasks: Task seq) : seq<float> =
    let completed, total =
        tasks
        |> Seq.map (fun t -> if t.Status = Done System.DateTime.MinValue then 1 else 0)
        |> Seq.fold (fun (c, t) isDone -> (c + isDone, t + 1)) (0, 0)

    // Simulate per-task rolling completion rate using scan
    tasks
    |> Seq.scan
        (fun (completedSoFar, totalSoFar) task ->
            let isDone = match task.Status with | Done _ -> 1 | _ -> 0
            (completedSoFar + isDone, totalSoFar + 1)
        )
        (0, 0)
    |> Seq.skip 1  // Skip the seed (0,0)
    |> Seq.map (fun (c, t) -> if t = 0 then 0.0 else float c / float t * 100.0)
