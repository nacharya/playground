import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 3000,
    // Dev proxy: forward API calls to backend services
    // In production, nginx handles this (see nginx.conf)
    proxy: {
      "/api": {
        target: "http://localhost:8500", // goffj
        changeOrigin: true,
      },
      "/trpc": {
        target: "http://localhost:8506", // tsnode
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8507",   // tsnode WebSocket
        ws: true,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: true,
    // Split vendor chunks for better caching — React/ReactDOM cached separately
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          router: ["react-router-dom"],
          query:  ["@tanstack/react-query"],
          dnd:    ["@dnd-kit/core", "@dnd-kit/sortable"],
        },
      },
    },
  },
});
