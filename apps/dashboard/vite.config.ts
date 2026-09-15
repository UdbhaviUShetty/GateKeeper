import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev-time proxy so the dashboard can call relative /admin, /metrics
    // paths without hardcoding the gateway's host — the browser talks to
    // Vite's dev server, which forwards to the gateway. In production this
    // dashboard would instead be built and served behind the same reverse
    // proxy setup or given the gateway's real base URL.
    proxy: {
      "/admin": "http://localhost:3000",
      "/metrics": "http://localhost:3000",
      "/api": "http://localhost:3000",
    },
  },
});
