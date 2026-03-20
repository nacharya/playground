(*
  Handlers/RealmHandlers.fs — Realm CRUD Handlers
  =================================================
*)
module PlaygroundApi.Handlers.RealmHandlers

open System
open System.Collections.Concurrent
open Microsoft.AspNetCore.Http
open PlaygroundApi.Domain.Types
open PlaygroundApi.Domain.Validation
open PlaygroundApi.Domain.Railway

let private store = ConcurrentDictionary<string, Realm>()

do
    let realm1 : Realm = {
        Id = "realm-1"; Name = "corp-azure"; Active = true
        Type = Azure; Owner = "alice"
        Tenant = "Contoso Corp"; AuthProvider = "Azure AD"
    }
    let realm2 : Realm = {
        Id = "realm-2"; Name = "dev-aws"; Active = true
        Type = AWS; Owner = "bob"
        Tenant = "Dev Environment"; AuthProvider = "AWS SSO"
    }
    store.TryAdd("realm-1", realm1) |> ignore
    store.TryAdd("realm-2", realm2) |> ignore


type RealmResponse = {
    Id:           string
    Name:         string
    Active:       bool
    Type:         string
    Owner:        string
    Tenant:       string
    AuthProvider: string
}

let private toResponse (r: Realm) : RealmResponse = {
    Id           = r.Id
    Name         = r.Name
    Active       = r.Active
    Type         = realmTypeToString r.Type
    Owner        = r.Owner
    Tenant       = r.Tenant
    AuthProvider = r.AuthProvider
}

let private errorToResult (err: DomainError) : IResult =
    match err with
    | NotFound entity     -> Results.NotFound({| error = $"Not found: {entity}" |})
    | ValidationError msg -> Results.BadRequest({| error = msg |})
    | Conflict msg        -> Results.Conflict({| error = msg |})
    | _                   -> Results.StatusCode(500)

let listRealms () : IResult =
    let realms = store.Values |> Seq.map toResponse |> Seq.toList
    Results.Ok realms

let getRealm (name: string) : IResult =
    match store.TryGetValue(name) with
    | true, realm -> Results.Ok (toResponse realm)
    | false, _    -> errorToResult (NotFound $"Realm '{name}'")

let createRealm (dto: CreateRealmDto) : IResult =
    match validateCreateRealm dto with
    | Error e      -> errorToResult e
    | Ok newRealm  ->
        if store.ContainsKey(newRealm.Name) then
            errorToResult (Conflict $"Realm '{newRealm.Name}' already exists")
        else
            store.TryAdd(newRealm.Name, newRealm) |> ignore
            Results.Created($"/api/v1/realms/{newRealm.Name}", toResponse newRealm)

let updateRealm (name: string) (dto: CreateRealmDto) : IResult =
    match store.TryGetValue(name) with
    | false, _ -> errorToResult (NotFound $"Realm '{name}'")
    | true, existing ->
        let updated = { existing with
                            Tenant       = if String.IsNullOrWhiteSpace dto.Tenant then existing.Tenant else dto.Tenant
                            AuthProvider = if String.IsNullOrWhiteSpace dto.AuthProvider then existing.AuthProvider else dto.AuthProvider }
        store.[name] <- updated
        Results.Ok (toResponse updated)

let deleteRealm (name: string) : IResult =
    match store.TryRemove(name) with
    | true, _  -> Results.NoContent()
    | false, _ -> errorToResult (NotFound $"Realm '{name}'")
