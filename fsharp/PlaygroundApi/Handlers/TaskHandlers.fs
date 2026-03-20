(*
  Handlers/TaskHandlers.fs — Task CRUD with State Machine Enforcement
  ====================================================================

  Tasks follow a state machine: Pending → InProgress → Done, or any → Cancelled.
  The domain layer (Validation.validateTaskTransition) enforces legal transitions.
  Illegal transitions return a DomainError.InvalidTransition → 400 Bad Request.
*)
module PlaygroundApi.Handlers.TaskHandlers

open System
open System.Collections.Concurrent
open Microsoft.AspNetCore.Http
open PlaygroundApi.Domain.Types
open PlaygroundApi.Domain.Validation
open PlaygroundApi.Domain.Railway

let private store = ConcurrentDictionary<string, Task>()

do
    let t1 : Task = { Id = "t1"; Name = "Setup CI"; Text = "Configure GitHub Actions"; Uid = "1"; Status = Pending; Due = None }
    let t2 : Task = { Id = "t2"; Name = "Write docs"; Text = "Document the API"; Uid = "2"; Status = InProgress "alice"; Due = Some (DateTime.UtcNow.AddDays(7.0)) }
    let t3 : Task = { Id = "t3"; Name = "Deploy v1"; Text = "Deploy to production"; Uid = "1"; Status = Done DateTime.UtcNow; Due = None }
    store.TryAdd("t1", t1) |> ignore
    store.TryAdd("t2", t2) |> ignore
    store.TryAdd("t3", t3) |> ignore


type TaskResponse = {
    Id:     string
    Name:   string
    Text:   string
    Uid:    string
    Status: string
    Due:    string option
}

let private toResponse (t: Task) : TaskResponse = {
    Id     = t.Id
    Name   = t.Name
    Text   = t.Text
    Uid    = t.Uid
    Status = taskStatusToString t.Status
    Due    = t.Due |> Option.map (fun dt -> dt.ToString("o"))
}

let private errorToResult (err: DomainError) : IResult =
    match err with
    | NotFound entity           -> Results.NotFound({| error = $"Not found: {entity}" |})
    | ValidationError msg       -> Results.BadRequest({| error = msg |})
    | Conflict msg              -> Results.Conflict({| error = msg |})
    | InvalidTransition (f, t)  -> Results.BadRequest({| error = $"Cannot transition from {f} to {t}" |})
    | _                         -> Results.StatusCode(500)

let listTasks (uid: string option) : IResult =
    let tasks = store.Values |> Seq.map toResponse |> Seq.toList
    match uid with
    | Some u -> Results.Ok (tasks |> List.filter (fun t -> t.Uid = u))
    | None   -> Results.Ok tasks

let getTask (id: string) : IResult =
    match store.TryGetValue(id) with
    | true, task -> Results.Ok (toResponse task)
    | false, _   -> errorToResult (NotFound $"Task '{id}'")

let createTask (dto: CreateTaskDto) : IResult =
    match validateCreateTask dto with
    | Error e      -> errorToResult e
    | Ok newTask   ->
        store.TryAdd(newTask.Id, newTask) |> ignore
        Results.Created($"/api/v1/tasks/{newTask.Id}", toResponse newTask)

/// Transition task to a new status.
/// The state machine is enforced by validateTaskTransition.
let transitionTask (id: string) (dto: UpdateTaskStatusDto) : IResult =
    match store.TryGetValue(id) with
    | false, _ -> errorToResult (NotFound $"Task '{id}'")
    | true, task ->
        match parseTaskStatus dto.NewStatus with
        | Error e         -> errorToResult e
        | Ok newStatus    ->
            match validateTaskTransition task.Status newStatus with
            | Error e         -> errorToResult e
            | Ok validStatus  ->
                let updated = { task with Status = validStatus }
                store.[id] <- updated
                Results.Ok (toResponse updated)

let deleteTask (id: string) : IResult =
    match store.TryRemove(id) with
    | true, _  -> Results.NoContent()
    | false, _ -> errorToResult (NotFound $"Task '{id}'")
