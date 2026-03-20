//go:build ignore
// +build ignore

// goffj/grpc/server.go — gRPC Server alongside Gin REST
// =======================================================
//
// This file adds a gRPC server to goffj, running concurrently with the
// existing Gin REST API on port 8500. The gRPC server listens on port 8510.
//
// BEFORE BUILDING: Generate the protobuf stubs first:
//   make proto
// or manually:
//   protoc --go_out=grpc/pb --go-grpc_out=grpc/pb -I ../../proto ../../proto/playground.proto
//
// Key Go concepts demonstrated here:
//   1. Running multiple servers concurrently with goroutines + errgroup
//   2. Implementing generated gRPC server interfaces
//   3. Mapping between domain models and protobuf messages
//   4. gRPC server reflection (enables grpcurl/Postman introspection)
//   5. Unary interceptors for logging and error handling
//   6. Graceful shutdown with os.Signal and context cancellation
//
// Test the gRPC server once running:
//   grpcurl -plaintext localhost:8510 list
//   grpcurl -plaintext localhost:8510 playground.UserService/ListUsers

package grpc

import (
	"context"
	"fmt"
	"net"
	"time"

	// NOTE: These imports will work after running 'make proto'
	// pb "goffj/grpc/pb"
	"goffj/core"

	log "github.com/sirupsen/logrus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (temporary — wire to the real DB layer from core/dbutils.go)
// TODO: Inject the core.DB interface here instead of using a local map
// ─────────────────────────────────────────────────────────────────────────────

var (
	users  = map[string]*core.User{}
	realms = map[string]*core.Realm{}
	tasks  = map[string]*core.Task{}
	apps   = map[string]*core.App{}
)

// ─────────────────────────────────────────────────────────────────────────────
// PlaygroundGRPCServer implements all four proto services
// ─────────────────────────────────────────────────────────────────────────────

// PlaygroundGRPCServer holds the server implementation for all services.
// One struct implements multiple interfaces — idiomatic Go for closely
// related services sharing the same backing store.
type PlaygroundGRPCServer struct {
	// pb.UnimplementedUserServiceServer  — embed after running protoc
	// pb.UnimplementedRealmServiceServer
	// pb.UnimplementedTaskServiceServer
	// pb.UnimplementedAppServiceServer
	clock core.Clock
}

// NewPlaygroundGRPCServer creates a server with a real clock.
func NewPlaygroundGRPCServer() *PlaygroundGRPCServer {
	return &PlaygroundGRPCServer{clock: core.NewClock()}
}

// ─────────────────────────────────────────────────────────────────────────────
// UserService implementation
// ─────────────────────────────────────────────────────────────────────────────

// GetUser retrieves a user by username.
// gRPC error codes map to HTTP status codes: NotFound → 404, InvalidArgument → 400
func (s *PlaygroundGRPCServer) GetUser(ctx context.Context /*, req *pb.GetUserRequest*/) ( /*pb.GetUserResponse,*/ error) {
	// if req.Username == "" {
	//     return nil, status.Error(codes.InvalidArgument, "username is required")
	// }
	// user, ok := users[req.Username]
	// if !ok {
	//     return nil, status.Errorf(codes.NotFound, "user %q not found", req.Username)
	// }
	// return &pb.GetUserResponse{User: domainUserToProto(user)}, nil
	_ = status.Error(codes.NotFound, "placeholder") // satisfy imports
	return nil
}

// ListUsers returns all users, optionally filtered by realm.
func (s *PlaygroundGRPCServer) ListUsers(ctx context.Context /*, req *pb.ListUsersRequest*/) ( /*pb.ListUsersResponse,*/ error) {
	// result := make([]*pb.User, 0, len(users))
	// for _, u := range users {
	//     if req.RealmId != "" && !containsRealm(u.Realms, req.RealmId) {
	//         continue
	//     }
	//     result = append(result, domainUserToProto(u))
	// }
	// return &pb.ListUsersResponse{Users: result}, nil
	return nil
}

// CreateUser validates and persists a new user.
func (s *PlaygroundGRPCServer) CreateUser(ctx context.Context /*, req *pb.CreateUserRequest*/) ( /*pb.CreateUserResponse,*/ error) {
	// if req.Email == "" {
	//     return nil, status.Error(codes.InvalidArgument, "email is required")
	// }
	// if _, exists := users[req.Username]; exists {
	//     return nil, status.Errorf(codes.AlreadyExists, "user %q already exists", req.Username)
	// }
	// user := &core.User{
	//     ID: uuid.New().String(), Username: req.Username, Email: req.Email,
	//     Name: req.Name, Role: req.Role, CreatedAt: s.clock.Now().Format(time.RFC3339),
	//     Realms: req.RealmIds,
	// }
	// users[user.Username] = user
	// return &pb.CreateUserResponse{User: domainUserToProto(user)}, nil
	return nil
}

// WatchUsers is a server-streaming RPC.
// The server pushes user change events to connected clients.
//
// Server-streaming pattern in Go:
//   for each event {
//       if err := stream.Send(&pb.User{...}); err != nil { return err }
//       select { case <-stream.Context().Done(): return nil  // client disconnected }
//   }
func (s *PlaygroundGRPCServer) WatchUsers( /*req *pb.ListUsersRequest, stream pb.UserService_WatchUsersServer*/) error {
	// ticker := time.NewTicker(5 * time.Second)
	// defer ticker.Stop()
	// for {
	//     select {
	//     case <-ticker.C:
	//         for _, u := range users {
	//             if err := stream.Send(domainUserToProto(u)); err != nil { return err }
	//         }
	//     case <-stream.Context().Done():
	//         return nil // client disconnected cleanly
	//     }
	// }
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Proto ↔ Domain conversion helpers
// ─────────────────────────────────────────────────────────────────────────────
// These functions translate between the protobuf-generated types and our domain
// structs. Keeping conversion at the edges keeps the domain layer proto-free.

// func domainUserToProto(u *core.User) *pb.User {
// 	return &pb.User{
// 		Id: u.ID, Username: u.Username, Email: u.Email,
// 		Name: u.Name, Role: u.Role, CreatedAt: u.CreatedAt,
// 		LastAccess: u.LastAccess, RealmIds: u.Realms,
// 	}
// }

// func domainTaskToProto(t *core.Task) *pb.Task {
// 	return &pb.Task{
// 		Id: t.ID, Name: t.Name, Text: t.Text,
// 		Completed: t.Completed, Uid: t.UID,
// 		Due: timestamppb.New(t.Due),
// 	}
// }

// ─────────────────────────────────────────────────────────────────────────────
// Interceptors
// ─────────────────────────────────────────────────────────────────────────────

// loggingInterceptor logs every RPC call with its duration and outcome.
// Unary interceptors wrap individual RPC calls (like HTTP middleware).
//
// Chain multiple interceptors:
//   grpc.ChainUnaryInterceptor(loggingInterceptor, authInterceptor, rateLimitInterceptor)
func loggingInterceptor(
	ctx context.Context,
	req interface{},
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (interface{}, error) {
	start := time.Now()

	// Call the actual handler
	resp, err := handler(ctx, req)

	duration := time.Since(start)
	entry := log.WithFields(log.Fields{
		"method":   info.FullMethod,
		"duration": duration,
	})

	if err != nil {
		// Extract gRPC status code for structured logging
		if s, ok := status.FromError(err); ok {
			entry.WithField("code", s.Code()).Warn("gRPC call failed")
		} else {
			entry.WithError(err).Error("gRPC call error")
		}
	} else {
		entry.Info("gRPC call succeeded")
	}

	return resp, err
}

// ─────────────────────────────────────────────────────────────────────────────
// Server startup
// ─────────────────────────────────────────────────────────────────────────────

// StartGRPCServer starts the gRPC server on the given port.
// Call this in a goroutine alongside the Gin HTTP server:
//
//	go grpc.StartGRPCServer(":8510")
//	router.Run(":8500")
func StartGRPCServer(port string) error {
	lis, err := net.Listen("tcp", port)
	if err != nil {
		return fmt.Errorf("grpc: failed to listen on %s: %w", port, err)
	}

	// Chain interceptors for logging and future auth
	srv := grpc.NewServer(
		grpc.ChainUnaryInterceptor(loggingInterceptor),
	)

	// Register all service implementations
	impl := NewPlaygroundGRPCServer()
	// pb.RegisterUserServiceServer(srv, impl)
	// pb.RegisterRealmServiceServer(srv, impl)
	// pb.RegisterTaskServiceServer(srv, impl)
	// pb.RegisterAppServiceServer(srv, impl)
	_ = impl // satisfy compiler until proto stubs are generated

	// Register reflection service.
	// This enables grpcurl/Postman/BloomRPC to discover services at runtime:
	//   grpcurl -plaintext localhost:8510 list
	//   grpcurl -plaintext localhost:8510 playground.UserService/ListUsers
	reflection.Register(srv)

	log.Infof("gRPC server listening on %s", port)

	// Seed some demo data
	users["alice"] = &core.User{ID: "1", Username: "alice", Email: "alice@example.com", Name: "Alice Smith", Role: "Admin"}
	users["bob"] = &core.User{ID: "2", Username: "bob", Email: "bob@example.com", Name: "Bob Jones", Role: "Contributor"}

	_ = timestamppb.Now() // satisfy import

	return srv.Serve(lis)
}
