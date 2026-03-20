// pgctl/src/grpc_server.rs
// =========================
// Tonic gRPC server — implements the PlaygroundService for Rust.
//
// Tonic is the idiomatic gRPC library for Rust, built on top of:
//   - tokio: async runtime
//   - hyper: HTTP/2 transport
//   - prost: Protobuf encoding/decoding
//
// Key concepts:
//   - `include_proto!` pulls in tonic-generated code at compile time
//   - Service traits are async — use `#[tonic::async_trait]`
//   - Request/Response types are thin wrappers: `tonic::Request<T>` / `tonic::Response<T>`
//   - Errors use `tonic::Status` (maps to gRPC status codes)
//   - Streaming uses `tokio_stream::wrappers::ReceiverStream`
//
// Port: 8511 (see docker-compose.yml)

use std::pin::Pin;
use std::sync::Arc;
use std::collections::HashMap;
use std::sync::Mutex;

use tonic::{transport::Server, Request, Response, Status};
use tonic_reflection::server::Builder as ReflectionBuilder;

// include_proto! expands to: mod playground { ... }
// It reads the generated file from OUT_DIR/playground.rs
// Must match the `package` name in playground.proto
mod playground {
    tonic::include_proto!("playground");

    // FILE_DESCRIPTOR_SET is needed for gRPC reflection
    // (allows grpcurl and other tools to discover services at runtime)
    pub const FILE_DESCRIPTOR_SET: &[u8] =
        tonic::include_file_descriptor_set!("playground_descriptor");
}

use playground::{
    user_service_server::{UserService, UserServiceServer},
    task_service_server::{TaskService, TaskServiceServer},
    // Import generated message types
    User, GetUserRequest, GetUserResponse,
    ListUsersRequest, ListUsersResponse,
    CreateUserRequest, CreateUserResponse,
    UpdateUserRequest, UpdateUserResponse,
    DeleteUserRequest, DeleteUserResponse,
    Task as ProtoTask, GetTaskRequest, GetTaskResponse,
    ListTasksRequest, ListTasksResponse,
    CreateTaskRequest, CreateTaskResponse,
    StreamTasksRequest,
};

// Streaming response type — Pin<Box<dyn Stream<...>>>
type StreamResult<T> = Pin<Box<dyn futures::Stream<Item = Result<T, Status>> + Send>>;

// ── In-memory store ───────────────────────────────────────────────────────────
// Using Arc<Mutex<...>> for shared mutable state across async tasks.
// In production use a real database.

#[derive(Debug, Default)]
struct Store {
    users: HashMap<String, User>,
    tasks: HashMap<String, ProtoTask>,
}

// ── UserService implementation ────────────────────────────────────────────────

pub struct PlaygroundUserService {
    store: Arc<Mutex<Store>>,
}

impl PlaygroundUserService {
    pub fn new(store: Arc<Mutex<Store>>) -> Self {
        Self { store }
    }
}

#[tonic::async_trait]
impl UserService for PlaygroundUserService {
    async fn get_user(
        &self,
        request: Request<GetUserRequest>,
    ) -> Result<Response<GetUserResponse>, Status> {
        let id = &request.into_inner().id;

        let store = self.store.lock().map_err(|_| Status::internal("lock error"))?;

        match store.users.get(id) {
            Some(user) => Ok(Response::new(GetUserResponse {
                user: Some(user.clone()),
            })),
            None => Err(Status::not_found(format!("user {} not found", id))),
        }
    }

    async fn list_users(
        &self,
        _request: Request<ListUsersRequest>,
    ) -> Result<Response<ListUsersResponse>, Status> {
        let store = self.store.lock().map_err(|_| Status::internal("lock error"))?;

        let users: Vec<User> = store.users.values().cloned().collect();
        Ok(Response::new(ListUsersResponse { users }))
    }

    async fn create_user(
        &self,
        request: Request<CreateUserRequest>,
    ) -> Result<Response<CreateUserResponse>, Status> {
        let req = request.into_inner();

        // Validation — map domain errors to gRPC status codes
        if req.username.is_empty() {
            return Err(Status::invalid_argument("username is required"));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let user = User {
            id: id.clone(),
            username: req.username,
            email: req.email,
            role: req.role,
            realm_id: req.realm_id,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            bio: String::new(),
        };

        let mut store = self.store.lock().map_err(|_| Status::internal("lock error"))?;
        store.users.insert(id, user.clone());

        Ok(Response::new(CreateUserResponse { user: Some(user) }))
    }

    async fn update_user(
        &self,
        request: Request<UpdateUserRequest>,
    ) -> Result<Response<UpdateUserResponse>, Status> {
        let req = request.into_inner();
        let mut store = self.store.lock().map_err(|_| Status::internal("lock error"))?;

        match store.users.get_mut(&req.id) {
            Some(user) => {
                if !req.username.is_empty() { user.username = req.username; }
                if !req.email.is_empty() { user.email = req.email; }
                if !req.role.is_empty() { user.role = req.role; }
                user.updated_at = chrono::Utc::now().to_rfc3339();
                Ok(Response::new(UpdateUserResponse { user: Some(user.clone()) }))
            }
            None => Err(Status::not_found(format!("user {} not found", req.id))),
        }
    }

    async fn delete_user(
        &self,
        request: Request<DeleteUserRequest>,
    ) -> Result<Response<DeleteUserResponse>, Status> {
        let id = request.into_inner().id;
        let mut store = self.store.lock().map_err(|_| Status::internal("lock error"))?;

        if store.users.remove(&id).is_some() {
            Ok(Response::new(DeleteUserResponse { success: true, message: "deleted".into() }))
        } else {
            Err(Status::not_found(format!("user {} not found", id)))
        }
    }

    // Server-streaming RPC — sends multiple User messages for one request
    // Uses tokio::sync::mpsc channel to produce items asynchronously
    type WatchUsersStream = StreamResult<User>;

    async fn watch_users(
        &self,
        _request: Request<ListUsersRequest>,
    ) -> Result<Response<Self::WatchUsersStream>, Status> {
        let (tx, rx) = tokio::sync::mpsc::channel(10);

        let store = Arc::clone(&self.store);

        // Spawn a task that periodically sends all users
        tokio::spawn(async move {
            for _ in 0..5 {
                let users = {
                    let s = store.lock().unwrap();
                    s.users.values().cloned().collect::<Vec<_>>()
                };

                for user in users {
                    if tx.send(Ok(user)).await.is_err() {
                        return; // Client disconnected
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        });

        // ReceiverStream wraps the mpsc receiver as a futures::Stream
        let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(stream)))
    }
}

// ── TaskService ───────────────────────────────────────────────────────────────

pub struct PlaygroundTaskService {
    store: Arc<Mutex<Store>>,
}

#[tonic::async_trait]
impl TaskService for PlaygroundTaskService {
    async fn list_tasks(
        &self,
        _request: Request<ListTasksRequest>,
    ) -> Result<Response<ListTasksResponse>, Status> {
        let store = self.store.lock().map_err(|_| Status::internal("lock error"))?;
        let tasks: Vec<ProtoTask> = store.tasks.values().cloned().collect();
        Ok(Response::new(ListTasksResponse { tasks }))
    }

    async fn create_task(
        &self,
        request: Request<CreateTaskRequest>,
    ) -> Result<Response<CreateTaskResponse>, Status> {
        let req = request.into_inner();
        let id = uuid::Uuid::new_v4().to_string();

        let task = ProtoTask {
            id: id.clone(),
            title: req.title,
            description: req.description,
            status: "pending".into(),
            assignee_id: req.assignee_id,
            realm_id: req.realm_id,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };

        let mut store = self.store.lock().map_err(|_| Status::internal("lock error"))?;
        store.tasks.insert(id, task.clone());

        Ok(Response::new(CreateTaskResponse { task: Some(task) }))
    }

    // Implement remaining CRUD methods similarly...
    async fn get_task(&self, request: Request<GetTaskRequest>) -> Result<Response<GetTaskResponse>, Status> {
        let id = &request.into_inner().id;
        let store = self.store.lock().map_err(|_| Status::internal("lock error"))?;
        match store.tasks.get(id) {
            Some(t) => Ok(Response::new(GetTaskResponse { task: Some(t.clone()) })),
            None => Err(Status::not_found(format!("task {} not found", id))),
        }
    }

    async fn update_task(&self, _: Request<UpdateTaskRequest>) -> Result<Response<UpdateTaskResponse>, Status> {
        Err(Status::unimplemented("not yet implemented"))
    }

    async fn delete_task(&self, _: Request<DeleteTaskRequest>) -> Result<Response<DeleteTaskResponse>, Status> {
        Err(Status::unimplemented("not yet implemented"))
    }

    // Server-streaming: emit tasks one by one as they're created (simplified demo)
    type StreamTasksStream = StreamResult<ProtoTask>;

    async fn stream_tasks(
        &self,
        _request: Request<StreamTasksRequest>,
    ) -> Result<Response<Self::StreamTasksStream>, Status> {
        let (tx, rx) = tokio::sync::mpsc::channel(10);
        let store = Arc::clone(&self.store);

        tokio::spawn(async move {
            let tasks: Vec<ProtoTask> = {
                let s = store.lock().unwrap();
                s.tasks.values().cloned().collect()
            };

            for task in tasks {
                if tx.send(Ok(task)).await.is_err() { return; }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        });

        Ok(Response::new(Box::pin(tokio_stream::wrappers::ReceiverStream::new(rx))))
    }
}

// ── Start gRPC server ─────────────────────────────────────────────────────────

pub async fn start_grpc_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let addr = format!("0.0.0.0:{}", port).parse()?;

    let store = Arc::new(Mutex::new(Store::default()));

    let user_svc = UserServiceServer::new(PlaygroundUserService::new(Arc::clone(&store)));
    let task_svc = TaskServiceServer::new(PlaygroundTaskService { store });

    // gRPC reflection — allows grpcurl to list services without knowing the proto
    let reflection = ReflectionBuilder::configure()
        .register_encoded_file_descriptor_set(playground::FILE_DESCRIPTOR_SET)
        .build()?;

    println!("gRPC server listening on {}", addr);

    Server::builder()
        .add_service(reflection)
        .add_service(user_svc)
        .add_service(task_svc)
        .serve(addr)
        .await?;

    Ok(())
}
