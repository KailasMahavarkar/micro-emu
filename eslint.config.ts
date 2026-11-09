import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

export default defineConfig(
  { ignores: ["legacy/**", "dist/**", "node_modules/**", "index.html"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { "import-x": importX },
    rules: {
      "import-x/no-cycle": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "no-restricted-globals": ["error", { name: "requestAnimationFrame", message: "Use setTimeout or restructure." }],
      "no-console": "error"
    }
  }
);
