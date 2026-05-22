import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@nerve/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
