import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Dev proxy: forward /api/* to Fastify API (avoids CORS in development)
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Keep chunks reasonable for on-prem (PITFALL #8: <2s FCP)
    // Note: Vite 8 uses rolldown; manualChunks must be a function (object form removed)
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
            return "vendor";
          }
        },
      },
    },
  },
});
