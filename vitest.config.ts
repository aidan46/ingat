import { defineConfig } from "vitest/config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Mirror tsconfig "@/*" -> "./*" so vitest's runtime resolver matches tsc.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "app/generated"],
  },
  resolve: { alias: { "@": root } },
});
