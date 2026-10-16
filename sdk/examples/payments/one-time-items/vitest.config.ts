import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom"
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src")
    }
  }
});
