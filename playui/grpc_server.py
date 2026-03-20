"""
grpc_server.py — FastAPI + gRPC Server (port 8505)
====================================================

This module serves two protocols on the same port:
  - FastAPI REST API (HTTP/1.1) for easy browser/curl access
  - gRPC (HTTP/2) for high-performance service-to-service calls

Both expose the same domain operations: Users, Realms, Tasks, Apps.
This mirrors the contract defined in proto/playground.proto.

Generate protobuf stubs:
  python -m grpc_tools.protoc \
      -I ../../proto \
      --python_out=proto \
      --grpc_python_out=proto \
      ../../proto/playground.proto

After generating stubs, replace the manual dataclasses below with:
  from proto.playground_pb2 import User, Realm, Task, App
  from proto.playground_pb2_grpc import PlaygroundServicer, add_to_server
"""

from __future__ import annotations

import asyncio
import logging
import os
from concurrent import futures
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import grpc
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("playui.grpc_server")

# ─────────────────────────────────────────────────────────────────────────────
# Domain types (manually mirroring proto/playground.proto)
# These will be replaced by generated pb2 classes after running protoc.
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class UserDomain:
    """Maps to the User message in proto/playground.proto."""
    id: str
    username: str
    email: str
    name: str
    role: str  # Admin | Contributor | ReadOnly
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    last_access: str = ""
    realm_ids: list[str] = field(default_factory=list)


@dataclass
class RealmDomain:
    """Maps to the Realm message in proto/playground.proto."""
    id: str
    name: str
    active: bool = True
    type: str = "UserShared"   # AD | AZURE | AWS | LDAP | UserShared
    owner: str = ""
    tenant: str = ""
    auth_provider: str = ""


@dataclass
class TaskDomain:
    """Maps to the Task message in proto/playground.proto."""
    id: str
    name: str
    text: str
    completed: bool = False
    uid: str = ""  # assigned user id
    due: str = ""


@dataclass
class AppDomain:
    """Maps to the App message in proto/playground.proto."""
    id: str
    name: str
    active: bool = True
    realm_ids: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# In-memory store with seed data
# ─────────────────────────────────────────────────────────────────────────────

import uuid

_users: dict[str, UserDomain] = {
    "alice": UserDomain("1", "alice", "alice@example.com", "Alice Smith", "Admin", realm_ids=["realm-1"]),
    "bob":   UserDomain("2", "bob",   "bob@example.com",   "Bob Jones",   "Contributor"),
}
_realms: dict[str, RealmDomain] = {
    "realm-1": RealmDomain("realm-1", "corp-azure", active=True, type="AZURE", owner="alice"),
    "realm-2": RealmDomain("realm-2", "dev-aws",    active=True, type="AWS",   owner="bob"),
}
_tasks: dict[str, TaskDomain] = {
    "t1": TaskDomain("t1", "Setup CI", "Configure GitHub Actions", uid="alice"),
    "t2": TaskDomain("t2", "Write docs", "Document the API", uid="bob"),
}


# ─────────────────────────────────────────────────────────────────────────────
# gRPC Servicer
# ─────────────────────────────────────────────────────────────────────────────
# After running protoc, this class should inherit from the generated servicer:
#   class PlaygroundServicer(playground_pb2_grpc.UserServiceServicer, ...):

class PlaygroundServicer:
    """
    gRPC service implementation for all playground services.

    Maps to these proto services (proto/playground.proto):
      - UserService
      - RealmService
      - TaskService
      - AppService

    Each method signature will match the generated stub after protoc.
    For now, we define them manually to show the pattern.
    """

    # ── UserService ───────────────────────────────────────────────────────

    def GetUser(self, request: Any, context: grpc.ServicerContext) -> Any:
        """
        Retrieve a user by username.
        Proto: rpc GetUser(GetUserRequest) returns (GetUserResponse)

        gRPC status codes (analogous to HTTP):
          codes.NOT_FOUND    → 404
          codes.INVALID_ARGUMENT → 400
          codes.ALREADY_EXISTS   → 409
        """
        username = getattr(request, "username", "")
        if not username:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("username is required")
            return None

        user = _users.get(username)
        if not user:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"user '{username}' not found")
            return None

        logger.info("GetUser: found %s", username)
        return user  # In real code: return pb2.GetUserResponse(user=user_to_proto(user))

    def ListUsers(self, request: Any, context: grpc.ServicerContext) -> Any:
        """
        Return all users, optionally filtered by realm_id.
        Proto: rpc ListUsers(ListUsersRequest) returns (ListUsersResponse)
        """
        realm_filter = getattr(request, "realm_id", "")
        users = list(_users.values())
        if realm_filter:
            users = [u for u in users if realm_filter in u.realm_ids]
        logger.info("ListUsers: returning %d users", len(users))
        return users  # In real code: return pb2.ListUsersResponse(users=[...])

    def CreateUser(self, request: Any, context: grpc.ServicerContext) -> Any:
        """
        Create a new user. Returns ALREADY_EXISTS if username taken.
        Proto: rpc CreateUser(CreateUserRequest) returns (CreateUserResponse)
        """
        username = getattr(request, "username", "")
        if username in _users:
            context.set_code(grpc.StatusCode.ALREADY_EXISTS)
            context.set_details(f"user '{username}' already exists")
            return None

        user = UserDomain(
            id=str(uuid.uuid4()),
            username=username,
            email=getattr(request, "email", ""),
            name=getattr(request, "name", ""),
            role=getattr(request, "role", "ReadOnly"),
            realm_ids=list(getattr(request, "realm_ids", [])),
        )
        _users[username] = user
        logger.info("CreateUser: created %s", username)
        return user

    # ── RealmService ──────────────────────────────────────────────────────

    def GetRealm(self, request: Any, context: grpc.ServicerContext) -> Any:
        """
        Retrieve a realm by name.
        Proto: rpc GetRealm(GetRealmRequest) returns (GetRealmResponse)
        """
        name = getattr(request, "name", "")
        realm = _realms.get(name)
        if not realm:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"realm '{name}' not found")
            return None
        return realm

    def ListRealms(self, request: Any, context: grpc.ServicerContext) -> Any:
        """
        List realms, optionally filtered to only active ones.
        Proto: rpc ListRealms(ListRealmsRequest) returns (ListRealmsResponse)
        """
        only_active = getattr(request, "only_active", False)
        realms = list(_realms.values())
        if only_active:
            realms = [r for r in realms if r.active]
        return realms

    # ── TaskService ───────────────────────────────────────────────────────

    def ListTasks(self, request: Any, context: grpc.ServicerContext) -> Any:
        """
        List tasks, optionally filtered by user ID and completion status.
        Proto: rpc ListTasks(ListTasksRequest) returns (ListTasksResponse)
        """
        uid_filter = getattr(request, "uid", "")
        only_pending = getattr(request, "only_pending", False)
        tasks = list(_tasks.values())
        if uid_filter:
            tasks = [t for t in tasks if t.uid == uid_filter]
        if only_pending:
            tasks = [t for t in tasks if not t.completed]
        return tasks

    def StreamTasks(self, request: Any, context: grpc.ServicerContext):
        """
        Server-streaming RPC: push task updates to client continuously.
        Proto: rpc StreamTasks(ListTasksRequest) returns (stream Task)

        Server-streaming pattern:
          - The server yields (or sends) multiple responses
          - The client receives them one by one
          - The stream ends when this function returns
          - The client can cancel by calling context.cancel()
        """
        import time
        while context.is_active():
            for task in _tasks.values():
                if not context.is_active():
                    return
                yield task  # In real code: yield task_to_proto(task)
            time.sleep(5)  # Push updates every 5 seconds


def start_grpc_server(port: int = 8512) -> grpc.Server:
    """
    Create and start the gRPC server.

    Uses a ThreadPoolExecutor for handling concurrent RPCs.
    max_workers=10 means up to 10 RPCs can be handled simultaneously.
    For CPU-bound tasks, match workers to CPU count.
    For I/O-bound tasks, you can go higher.
    """
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))

    servicer = PlaygroundServicer()

    # After running protoc, register like this:
    # playground_pb2_grpc.add_UserServiceServicer_to_server(servicer, server)
    # playground_pb2_grpc.add_RealmServiceServicer_to_server(servicer, server)
    # playground_pb2_grpc.add_TaskServiceServicer_to_server(servicer, server)

    listen_addr = f"[::]:{port}"
    server.add_insecure_port(listen_addr)
    server.start()
    logger.info("gRPC server started on %s", listen_addr)
    return server


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI REST API (same port 8505, different protocol)
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Playground Python API",
    description="FastAPI REST layer + gRPC service for the playground",
    version="1.0.0",
)


# Pydantic models for request validation
# Pydantic validates types at runtime and generates OpenAPI schemas automatically.
class CreateUserRequest(BaseModel):
    username: str
    email: str
    name: str
    role: str = "ReadOnly"
    realm_ids: list[str] = []


class CreateRealmRequest(BaseModel):
    name: str
    type: str = "UserShared"
    owner: str
    tenant: str = ""
    auth_provider: str = ""


@app.get("/health")
async def health() -> dict:
    """Health check endpoint. Used by Docker healthcheck and load balancers."""
    return {"status": "ok", "service": "playui", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/users")
async def list_users(realm_id: str = "") -> list[dict]:
    """
    List all users. Optionally filter by ?realm_id=...

    FastAPI automatically generates query params from function arguments.
    The OpenAPI docs at /docs show this with a "Try it out" button.
    """
    users = list(_users.values())
    if realm_id:
        users = [u for u in users if realm_id in u.realm_ids]
    return [vars(u) for u in users]


@app.get("/api/users/{username}")
async def get_user(username: str) -> dict:
    """Path parameters: FastAPI extracts {username} from the URL automatically."""
    user = _users.get(username)
    if not user:
        # FastAPI converts HTTPException to proper JSON error response
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return vars(user)


@app.post("/api/users", status_code=201)
async def create_user(req: CreateUserRequest) -> dict:
    """
    Create a user. Pydantic validates the request body automatically.

    If validation fails (missing fields, wrong types), FastAPI returns 422
    with detailed field-level error messages — no manual validation needed.
    """
    if req.username in _users:
        raise HTTPException(status_code=409, detail=f"User '{req.username}' already exists")

    user = UserDomain(
        id=str(uuid.uuid4()),
        username=req.username,
        email=req.email,
        name=req.name,
        role=req.role,
        realm_ids=req.realm_ids,
    )
    _users[req.username] = user
    return vars(user)


@app.get("/api/realms")
async def list_realms(only_active: bool = False) -> list[dict]:
    """List realms. Boolean query params: ?only_active=true"""
    realms = list(_realms.values())
    if only_active:
        realms = [r for r in realms if r.active]
    return [vars(r) for r in realms]


@app.get("/api/tasks")
async def list_tasks(uid: str = "", only_pending: bool = False) -> list[dict]:
    tasks = list(_tasks.values())
    if uid:
        tasks = [t for t in tasks if t.uid == uid]
    if only_pending:
        tasks = [t for t in tasks if not t.completed]
    return [vars(t) for t in tasks]


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    grpc_port = int(os.environ.get("GRPC_PORT", "8512"))
    rest_port = int(os.environ.get("REST_PORT", "8505"))

    # Start gRPC in a background thread (grpc.server is thread-based)
    grpc_server = start_grpc_server(grpc_port)

    logger.info("FastAPI REST server starting on port %d", rest_port)
    # uvicorn runs the async FastAPI app
    uvicorn.run(app, host="0.0.0.0", port=rest_port, log_level="info")

    # Graceful shutdown of gRPC when uvicorn exits
    grpc_server.stop(grace=5)
