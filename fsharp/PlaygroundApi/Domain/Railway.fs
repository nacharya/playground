(*
  Domain/Railway.fs — Railway-Oriented Programming
  =================================================

  The "happy path" in most code is buried under error handling.
  Railway-oriented programming (ROP) flips this:

    Traditional (nested if/else):
      if (validateEmail(email)) {
          if (validateRole(role)) {
              if (userExists(username)) {
                  return Error("Already exists")
              }
              return Ok(createUser(...))
          }
          return Error("Invalid role")
      }
      return Error("Invalid email")

    ROP (pipeline):
      validateEmail email
      |> Result.bind (validateRole)
      |> Result.bind (checkUserExists)
      |> Result.map createUser

  Visual model — two railway tracks:
    ═══════════════════════════════════════► (Success track)
    ═══════════════════════════════════════► (Failure track)

  Each function is a "switch":
    - If input is on Success track, it processes and may switch to Failure
    - If input is on Failure track, it passes through unchanged (short-circuits)

  This module provides the combinators to build these pipelines.
  F# has built-in Result.map and Result.bind — we also add extras like tee, apply, sequence.
*)
module PlaygroundApi.Domain.Railway

open PlaygroundApi.Domain.Types

// ─────────────────────────────────────────────────────────────────────────────
// Core combinators
// ─────────────────────────────────────────────────────────────────────────────

/// bind (>>=): chain Result-returning functions
/// If input is Ok, apply fn to the value. If Error, pass through.
/// This is the fundamental operation — everything else builds on it.
let bind (fn: 'a -> Result<'b, 'e>) (result: Result<'a, 'e>) : Result<'b, 'e> =
    match result with
    | Ok value -> fn value
    | Error e  -> Error e

/// map (<!>): transform the Ok value without changing the error type.
/// If fn never fails, use map. If fn can fail, use bind.
let map (fn: 'a -> 'b) (result: Result<'a, 'e>) : Result<'b, 'e> =
    match result with
    | Ok value -> Ok (fn value)
    | Error e  -> Error e

/// mapError: transform the Error value (e.g., convert error types)
let mapError (fn: 'e1 -> 'e2) (result: Result<'a, 'e1>) : Result<'a, 'e2> =
    match result with
    | Ok value -> Ok value
    | Error e  -> Error (fn e)

/// tee (>>!): run a side effect (logging, metrics) on the Ok value.
/// Returns the original Result unchanged — doesn't affect the pipeline.
/// Useful for: logging, audit trails, metrics, debugging.
let tee (fn: 'a -> unit) (result: Result<'a, 'e>) : Result<'a, 'e> =
    match result with
    | Ok value -> fn value; Ok value  // Run side effect, return original
    | Error _  -> result              // Pass through on error

/// either: run different functions for Ok vs Error cases.
/// Unlike map/bind, both branches return the same type.
let either (onOk: 'a -> 'c) (onError: 'e -> 'c) (result: Result<'a, 'e>) : 'c =
    match result with
    | Ok value -> onOk value
    | Error e  -> onError e

/// apply (<*>): applicative-style — apply a Result-wrapped function to a Result-wrapped value.
/// Used when you have multiple independent validations you want to run in parallel.
let apply (fnResult: Result<'a -> 'b, 'e>) (valueResult: Result<'a, 'e>) : Result<'b, 'e> =
    match fnResult, valueResult with
    | Ok fn, Ok value -> Ok (fn value)
    | Error e, _      -> Error e
    | _, Error e      -> Error e

/// sequence: convert a list of Results into a Result of a list.
/// If ALL succeed → Ok(list of values)
/// If ANY fail    → Error(first error encountered)
let sequence (results: Result<'a, 'e> list) : Result<'a list, 'e> =
    let folder acc result =
        match acc, result with
        | Ok values, Ok value -> Ok (values @ [value])
        | Error e, _          -> Error e
        | _, Error e          -> Error e
    List.fold folder (Ok []) results

// ─────────────────────────────────────────────────────────────────────────────
// Operator aliases — for pipeline-style code
// ─────────────────────────────────────────────────────────────────────────────
(*
  F# operators must be defined as let operators.
  These are the standard symbols used in functional programming:
    >>= is bind (Haskell convention)
    <!> is map  (functor map)
    <*> is apply (applicative apply)
    >>! is tee
*)

let (>>=) result fn    = bind fn result
let (<!>) result fn    = map fn result
let (<*>) fnRes valRes = apply fnRes valRes
let (>>!) result fn    = tee fn result

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Lift a plain value into a Result (always succeeds)
let succeed (value: 'a) : Result<'a, DomainError> = Ok value

/// Create a failure Result with a DomainError
let fail (error: DomainError) : Result<'a, DomainError> = Error error

/// Convert an Option to a Result, with a provided error for None
let fromOption (error: DomainError) (opt: 'a option) : Result<'a, DomainError> =
    match opt with
    | Some value -> Ok value
    | None       -> Error error

/// Combine two Results — if both Ok, return Ok of a tuple
let zip (r1: Result<'a, 'e>) (r2: Result<'b, 'e>) : Result<'a * 'b, 'e> =
    match r1, r2 with
    | Ok a, Ok b   -> Ok (a, b)
    | Error e, _   -> Error e
    | _, Error e   -> Error e

// ─────────────────────────────────────────────────────────────────────────────
// Example: how a validation pipeline looks with these combinators
// ─────────────────────────────────────────────────────────────────────────────
(*
  Without ROP (nested match):
    match validateEmail email with
    | Error e -> Error e
    | Ok validEmail ->
        match validateRole role with
        | Error e -> Error e
        | Ok validRole ->
            Ok { ... }

  With ROP (pipeline):
    email
    |> validateEmail        // Result<string, DomainError>
    >>= (fun validEmail ->
        role
        |> validateRole    // Result<UserRole, DomainError>
        |> map (fun validRole -> { Email = validEmail; Role = validRole; ... })
    )

  Or with the result computation expression (see ComputationExpressions.fs):
    result {
        let! validEmail = validateEmail email
        let! validRole  = validateRole role
        return { Email = validEmail; Role = validRole; ... }
    }
*)
