module PlaygroundApi.Tests.DomainTests

// ============================================================
// Domain Tests — demonstrates F# testing patterns with xUnit + FsUnit
//
// Key concepts:
//   - xUnit [<Fact>] and [<Theory>] attributes work in F#
//   - FsUnit provides readable should/shouldEqual/shouldContain assertions
//   - Property-based patterns using parameterized tests
//   - Testing Railway-Oriented Programming (Result types)
//   - Testing Discriminated Union state machines
// ============================================================

open Xunit
open FsUnit.Xunit
open PlaygroundApi.Domain.Types
open PlaygroundApi.Domain.Validation
open PlaygroundApi.Domain.Railway

// ── Validation Tests ──────────────────────────────────────────────────────────

module ValidationTests =

    // [<Fact>] marks a test with no parameters
    [<Fact>]
    let ``validateNotEmpty returns Ok for non-empty string`` () =
        let result = validateNotEmpty "name" "Alice"
        result |> should equal (Ok "Alice")

    [<Fact>]
    let ``validateNotEmpty returns Error for empty string`` () =
        let result = validateNotEmpty "name" ""
        result |> should be (ofCase <@ Result<string, DomainError>.Error @>)

    [<Fact>]
    let ``validateNotEmpty returns Error for whitespace-only string`` () =
        let result = validateNotEmpty "name" "   "
        result |> should be (ofCase <@ Result<string, DomainError>.Error @>)

    // [<Theory>] with [<InlineData>] = parameterized tests
    // Each InlineData row is a separate test case.
    [<Theory>]
    [<InlineData("alice")>]
    [<InlineData("bob123")>]
    [<InlineData("user-name")>]
    let ``validateUsername accepts valid usernames`` (username: string) =
        let result = validateUsername username
        result |> should equal (Ok username)

    [<Theory>]
    [<InlineData("")>]              // empty
    [<InlineData("ab")>]           // too short
    [<InlineData("a b c")>]        // contains space
    [<InlineData("UPPERCASE")>]    // uppercase
    [<InlineData("user@name")>]    // special char
    let ``validateUsername rejects invalid usernames`` (username: string) =
        let result = validateUsername username
        result |> should be (ofCase <@ Result<string, DomainError>.Error @>)

    [<Theory>]
    [<InlineData("user@example.com")>]
    [<InlineData("alice.bob+tag@domain.co.uk")>]
    let ``validateEmail accepts valid emails`` (email: string) =
        let result = validateEmail email
        result |> should equal (Ok email)

    [<Theory>]
    [<InlineData("not-an-email")>]
    [<InlineData("@nodomain.com")>]
    [<InlineData("no-at-sign")>]
    let ``validateEmail rejects invalid emails`` (email: string) =
        let result = validateEmail email
        result |> should be (ofCase <@ Result<string, DomainError>.Error @>)

// ── Railway-Oriented Programming Tests ────────────────────────────────────────

module RailwayTests =

    [<Fact>]
    let ``bind threads Ok values through a pipeline`` () =
        let result =
            Ok "  hello  "
            |> bind (fun s -> Ok (s.Trim()))
            |> bind (fun s -> Ok (s.ToUpper()))

        result |> should equal (Ok "HELLO")

    [<Fact>]
    let ``bind short-circuits on Error`` () =
        let mutable sideEffectCount = 0

        let result =
            Error (ValidationError "initial error")
            |> bind (fun _ ->
                sideEffectCount <- sideEffectCount + 1
                Ok "should not reach here")

        // The function was never called
        sideEffectCount |> should equal 0
        result |> should be (ofCase <@ Result<string, DomainError>.Error @>)

    [<Fact>]
    let ``map transforms Ok value without unwrapping`` () =
        let result =
            Ok 5
            |> map (fun x -> x * 2)
            |> map (fun x -> x + 1)

        result |> should equal (Ok 11)

    [<Fact>]
    let ``map does not touch Error values`` () =
        let result =
            Error (ValidationError "oops") : Result<int, DomainError>
            |> map (fun x -> x * 2)

        result |> should be (ofCase <@ Result<int, DomainError>.Error @>)

    [<Fact>]
    let ``sequence collects all Ok values into a list`` () =
        let results = [Ok 1; Ok 2; Ok 3]
        let combined = sequence results
        combined |> should equal (Ok [1; 2; 3])

    [<Fact>]
    let ``sequence returns first Error if any result is Error`` () =
        let results = [Ok 1; Error (ValidationError "bad"); Ok 3]
        let combined = sequence results
        combined |> should be (ofCase <@ Result<int list, DomainError>.Error @>)

// ── Task State Machine Tests ───────────────────────────────────────────────────

module TaskStateMachineTests =

    [<Fact>]
    let ``Pending task can transition to InProgress`` () =
        let result = validateTaskTransition Pending (InProgress "alice")
        result |> should be (ofCase <@ Result<TaskStatus, DomainError>.Ok @>)

    [<Fact>]
    let ``Pending task can be Cancelled`` () =
        let result = validateTaskTransition Pending (Cancelled "duplicate")
        result |> should be (ofCase <@ Result<TaskStatus, DomainError>.Ok @>)

    [<Fact>]
    let ``Pending task cannot jump directly to Done`` () =
        let result = validateTaskTransition Pending (Done System.DateTime.UtcNow)
        result |> should be (ofCase <@ Result<TaskStatus, DomainError>.Error @>)

    [<Fact>]
    let ``InProgress task can transition to Done`` () =
        let result = validateTaskTransition (InProgress "alice") (Done System.DateTime.UtcNow)
        result |> should be (ofCase <@ Result<TaskStatus, DomainError>.Ok @>)

    [<Fact>]
    let ``Done task cannot transition to anything`` () =
        let doneStatus = Done System.DateTime.UtcNow

        let toInProgress = validateTaskTransition doneStatus (InProgress "alice")
        let toPending    = validateTaskTransition doneStatus Pending
        let toCancelled  = validateTaskTransition doneStatus (Cancelled "reason")

        toInProgress |> should be (ofCase <@ Result<TaskStatus, DomainError>.Error @>)
        toPending    |> should be (ofCase <@ Result<TaskStatus, DomainError>.Error @>)
        toCancelled  |> should be (ofCase <@ Result<TaskStatus, DomainError>.Error @>)

    [<Fact>]
    let ``Cancelled task cannot be reactivated`` () =
        let result = validateTaskTransition (Cancelled "reason") (InProgress "alice")
        result |> should be (ofCase <@ Result<TaskStatus, DomainError>.Error @>)

// ── Composite Validation Tests ────────────────────────────────────────────────

module CompositeValidationTests =

    [<Fact>]
    let ``validateCreateUser succeeds with valid data`` () =
        let result = validateCreateUser "alice" "alice@example.com" "Admin"
        result |> should be (ofCase <@ Result<string * string * UserRole, DomainError>.Ok @>)

    [<Fact>]
    let ``validateCreateUser fails if any field is invalid`` () =
        // Bad email but valid username and role
        let result = validateCreateUser "alice" "not-an-email" "Admin"
        result |> should be (ofCase <@ Result<string * string * UserRole, DomainError>.Error @>)

    [<Fact>]
    let ``validateCreateUser fails with invalid role`` () =
        let result = validateCreateUser "alice" "alice@example.com" "SuperAdmin"
        result |> should be (ofCase <@ Result<string * string * UserRole, DomainError>.Error @>)
