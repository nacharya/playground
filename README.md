# Playground — Polyglot Learning Monorepo

A hands-on playground for exploring multiple languages and frameworks side by side, with production-quality patterns and detailed explanations.

## What's inside

| Service | Language | Port (REST) | Port (gRPC) | Key examples |
|---|---|---|---|---|
| **goffj** | Go | 8500 | 8510 | Worker pools, channel pipelines, goroutines |
| **pgctl** | Rust | 8502 | 8511 | Actix-web, tonic gRPC, async/await |
| **playui** | Python | 8504/8505 | 8512 | PyTorch CNN, Streamlit, FastAPI, asyncio |
| **tsnode** | TypeScript | 8506/8507 | 8513 | tRPC, WebSocket pub/sub, generics, streams |
| **fsharp** | F# | 8508 | 8509 | DU state machines, Railway OP, CEs |
| **reactapp** | React | 80 | — | React Query, Zustand, drag-and-drop, generics |

All services share a gRPC contract defined in `proto/playground.proto`.

## Quick start

```bash
# One-time setup
make setup         # creates .env from .env.example

# Start everything
make up            # docker compose up --build -d

# Or start selectively
make up-infra      # postgres + nats only
make up-go         # postgres + nats + goffj
make up-python     # postgres + nats + goffj + playui
make up-ts         # postgres + nats + goffj + tsnode + reactapp
make up-fsharp     # postgres + nats + goffj + fsharp

# Open all UIs (macOS)
make open-ui

# View logs
make compose-logs

# Stop
make down          # stop containers
make down-clean    # stop + remove volumes
```

## Service UIs

| URL | What |
|---|---|
| http://localhost:80 | React app |
| http://localhost:8504 | Streamlit (PyTorch, data explorer) |
| http://localhost:8505/docs | FastAPI Swagger |
| http://localhost:8500/health | goffj health |
| http://localhost:8506/health | tsnode health |
| http://localhost:8508/health | F# health |

## gRPC

```bash
# List services (requires grpcurl: brew install grpcurl)
make grpc-list

# Manual call
grpcurl -plaintext localhost:8510 list
grpcurl -plaintext -d '{"id": "1"}' localhost:8510 playground.UserService/GetUser
```

Generate stubs after editing `proto/playground.proto`:
```bash
make proto
```

## Structure

```
playground/
├── proto/                 # Shared Protobuf3 contract
├── goffj/                 # Go — Gin REST + gRPC server
│   ├── core/              # Domain models
│   ├── router/            # HTTP handlers
│   ├── grpc/              # gRPC server (build after make proto)
│   └── examples/
│       ├── concurrency/   # Worker pool, fan-in, rate limiting
│       └── channels/      # Pipeline pattern, select, semaphore
├── pgctl/                 # Rust — Actix-web REST + Tonic gRPC
│   ├── src/
│   │   ├── server.rs      # HTTP server
│   │   └── grpc_server.rs # gRPC server (enable --features grpc)
│   └── build.rs           # tonic-build codegen
├── playui/                # Python — Streamlit + FastAPI
│   ├── streamlit/
│   │   └── pages/
│   │       ├── 01_pytorch_mnist.py   # CNN training with live charts
│   │       ├── 02_autograd_tutorial.py
│   │       ├── 03_data_explorer.py
│   │       └── 04_api_client.py
│   └── pytorch/
│       └── asyncio_pipeline.py       # Producer/consumer, TaskGroup
├── tsnode/                # TypeScript — tRPC + WebSocket + gRPC
│   └── src/
│       ├── trpc/router.ts            # End-to-end type-safe API
│       ├── ws/server.ts              # PubSub WebSocket server
│       ├── grpc/server.ts            # Dynamic proto loading
│       └── examples/
│           ├── generics_demo.ts      # Conditional types, infer, mapped types
│           ├── streams_demo.ts       # Transform streams, backpressure
│           └── decorators_demo.ts    # Class/method/property/param decorators
├── reactapp/              # React — Vite + React Query + Zustand + dnd-kit
│   └── src/
│       ├── store/appStore.ts         # Zustand with devtools+persist
│       ├── hooks/
│       │   ├── useApi.ts             # React Query + optimistic updates
│       │   └── useWebSocket.ts       # Auto-reconnecting WebSocket hook
│       └── components/
│           ├── RealmDashboard.tsx    # Compound component pattern
│           ├── TaskBoard.tsx         # Drag-and-drop Kanban
│           └── UserTable.tsx         # Generic Table<T>
├── fsharp/                # F# — ASP.NET Core + gRPC
│   └── PlaygroundApi/
│       ├── Domain/
│       │   ├── Types.fs              # Discriminated unions, records
│       │   ├── Railway.fs            # bind, map, sequence combinators
│       │   └── Validation.fs         # Composable validators
│       ├── Examples/
│       │   ├── ComputationExpressions.fs  # result, maybe, asyncResult CEs
│       │   ├── ActivePatterns.fs          # Partial, complete, parameterized
│       │   ├── Sequences.fs               # Seq.unfold, Seq.scan, lazy eval
│       │   └── Pipeline.fs               # |>, >>, partial application
│       └── Handlers/                 # REST endpoint handlers
├── infra/                 # Terraform — AWS, Azure, GCP
│   ├── modules/
│   │   ├── networking/   # VPC, subnets, IGW, NAT
│   │   ├── storage/      # S3 + encryption + lifecycle
│   │   └── container/    # ECS Fargate service
│   ├── aws/              # AWS root config
│   ├── azure/            # Azure Container Apps
│   └── gcp/              # GCP Cloud Run
├── docker-compose.yml    # Full stack orchestration
├── Makefile              # Developer workflow
└── .env.example          # Environment variable template
```

## Learning paths

### New to gRPC?
Start with `proto/README.md` → `goffj/grpc/server.go` → `tsnode/src/grpc/server.ts`

### Exploring Go concurrency?
Read `goffj/examples/concurrency/worker_pool.go` and `goffj/examples/channels/pipeline.go`

### Learning PyTorch?
Open http://localhost:8504 → MNIST CNN page — trains a real neural network in the browser

### Understanding F# type system?
Read in order: `Domain/Types.fs` → `Domain/Railway.fs` → `Examples/ComputationExpressions.fs`

### TypeScript type system deep dive?
Read `tsnode/src/examples/generics_demo.ts` → `decorators_demo.ts` → `streams_demo.ts`

### React patterns?
- Compound components: `reactapp/src/components/RealmDashboard.tsx`
- Drag-and-drop: `reactapp/src/components/TaskBoard.tsx`
- Generic components: `reactapp/src/components/UserTable.tsx`
- WebSocket hook: `reactapp/src/hooks/useWebSocket.ts`
