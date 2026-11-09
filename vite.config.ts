import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: Number.MAX_SAFE_INTEGER },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 30_000
  }
});
