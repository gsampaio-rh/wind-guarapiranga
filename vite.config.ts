import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { port: 5173 },
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  test: { environment: "node" },
});
