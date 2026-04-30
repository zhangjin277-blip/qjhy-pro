// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  { ignores: [".next", "node_modules", "dist", "src/db/migrations"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      import: importPlugin,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      // ★ 跨模块 import 必须走 index.ts (CRITICAL — 屎山防护核心规则)
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/modules/**",
              from: "./src/modules/**",
              except: ["**/index.ts"],
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
          ],
        },
      ],
      // 禁止 any
      "@typescript-eslint/no-explicit-any": "error",
      // 禁止未使用变量（除非以 _ 开头）
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // React hooks 规则
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Next.js 规则
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
    },
  },
);
