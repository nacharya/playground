DOCKER=docker

IMG_NAME=nplayg
CTR_NAME=nplayg
IMG_VERSION=latest
IMG_TAG=$(IMG_NAME):$(IMG_VERSION)
PORT1=8500:8500
PORT2=8501:8501

# go lang sources
GSRCDIR=goffj
# rust based sources
RSRCDIR=pgctl
# Python3 based sources
PSRCDIR=playui

VOLDATA=`pwd`/data

all: $(IMG_NAME)

.PHONY: all $(SUBDIRS)

SUBDIRS: $(GSRCDIR) $(RSRCDIR) $(PSRCDIR)

$(IMG_NAME):
	$(DOCKER) build -t $(IMG_TAG) --no-cache \
					-f Dockerfile .

run:
	mkdir -p data
	$(DOCKER) run -tid -p $(PORT1) -p $(PORT2) -v $(VOLDATA):/data --name $(CTR_NAME) $(IMG_NAME)

shell:
ifeq ($(OS),Windows_NT)
	winpty $(DOCKER) exec -ti $(CTR_NAME) /bin/bash
else
	$(DOCKER) exec -ti $(CTR_NAME) /bin/bash
endif


save:
	$(DOCKER) commit $(CTR_NAME) $(IMG_TAG)

stop:
	$(DOCKER) stop $(CTR_NAME)
	$(DOCKER) rm $(CTR_NAME)

logs:
	$(DOCKER) logs $(CTR_NAME)

show:
	$(DOCKER) ps -a | grep $(CTR_NAME)

rmi:
	$(DOCKER) rmi $(IMG_TAG)

prune:
	$(DOCKER) system prune -f

clean:
	rm -rf data

# ============================================================
# Docker Compose — full playground orchestration
# ============================================================

## Start ALL services (builds images first)
up:
	docker compose up --build -d

## Start only infrastructure (postgres + nats)
up-infra:
	docker compose up -d postgres nats

## Start Go stack (postgres + nats + goffj)
up-go:
	docker compose up -d postgres nats goffj

## Start Rust service only
up-rust:
	docker compose up -d pgctl

## Start Python stack (goffj + playui)
up-python:
	docker compose up -d postgres nats goffj playui

## Start TypeScript + React stack
up-ts:
	docker compose up -d postgres nats goffj tsnode reactapp

## Start F# stack (goffj + fsharp)
up-fsharp:
	docker compose up -d postgres nats goffj fsharp

## Stop all services
down:
	docker compose down

## Stop + remove all volumes (clean slate)
down-clean:
	docker compose down -v

## Follow all service logs
compose-logs:
	docker compose logs -f

## Show running container status
ps:
	docker compose ps

## Rebuild all images without cache
rebuild:
	docker compose build --no-cache

## Run tests in all service containers
test:
	docker compose run --rm goffj go test ./...
	docker compose run --rm pgctl cargo test
	docker compose run --rm playui python -m pytest playui/ -v || true
	docker compose run --rm tsnode npm run typecheck
	docker compose run --rm fsharp dotnet test

## Generate protobuf stubs for all languages
proto:
	@echo "==> Generating protobuf stubs for all languages"
	@echo ""
	@echo "Go (requires: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest)"
	@mkdir -p goffj/grpc/pb
	cd proto && protoc --go_out=../goffj/grpc/pb --go-grpc_out=../goffj/grpc/pb playground.proto 2>/dev/null || echo "  [skip] protoc-gen-go not installed"
	@echo ""
	@echo "Python (requires: pip install grpcio-tools)"
	@mkdir -p playui/proto
	cd proto && python -m grpc_tools.protoc -I. --python_out=../playui/proto --grpc_python_out=../playui/proto playground.proto 2>/dev/null || echo "  [skip] grpcio-tools not installed"
	@echo ""
	@echo "TypeScript (requires: npm i -g ts-proto)"
	@mkdir -p tsnode/src/proto
	cd proto && protoc --plugin=protoc-gen-ts_proto=$$(which protoc-gen-ts_proto) --ts_proto_out=../tsnode/src/proto playground.proto 2>/dev/null || echo "  [skip] ts-proto not installed"
	@echo ""
	@echo "Rust: uses tonic-build in pgctl/build.rs (auto-runs on cargo build)"
	@echo "F#:   uses Grpc.Tools NuGet (auto-runs on dotnet build with Protobuf ItemGroup)"
	@echo ""
	@echo "==> Done. Check above for any skipped languages."

## First-time setup
setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env — edit it with your values"; fi
	@mkdir -p data
	@echo "Setup complete. Run 'make up' to start all services."

## Open service UIs in browser (macOS)
open-ui:
	open http://localhost:80     # React app
	open http://localhost:8504   # Streamlit
	open http://localhost:8500   # goffj API
	open http://localhost:8506   # tsnode
	open http://localhost:8508   # fsharp
	open http://localhost:8505/docs  # FastAPI docs

## List gRPC services using grpcurl (brew install grpcurl)
grpc-list:
	@echo "==> goffj gRPC (port 8510):"
	grpcurl -plaintext localhost:8510 list 2>/dev/null || echo "  Service not running"
	@echo ""
	@echo "==> tsnode gRPC (port 8513):"
	grpcurl -plaintext localhost:8513 list 2>/dev/null || echo "  Service not running"
	@echo ""
	@echo "==> fsharp gRPC (port 8509):"
	grpcurl -plaintext localhost:8509 list 2>/dev/null || echo "  Service not running"
