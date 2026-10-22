package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"alfaflow/internal/httpapi"
	"alfaflow/internal/store"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL required")
		os.Exit(1)
	}
	s, e := store.Open(ctx, dbURL)
	if e != nil {
		slog.Error("database startup", "error", e)
		os.Exit(1)
	}
	defer s.Pool.Close()
	if e = s.Seed(ctx); e != nil {
		slog.Error("seed", "error", e)
		os.Exit(1)
	}
	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	server := &http.Server{Addr: addr, Handler: httpapi.New(s, os.Getenv("DEMO_MODE") == "true"), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		c, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		_ = server.Shutdown(c)
	}()
	slog.Info("api ready", "addr", addr, "ai_enabled", false)
	if e = server.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		slog.Error("serve", "error", e)
		os.Exit(1)
	}
}
