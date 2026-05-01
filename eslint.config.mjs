// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  { ignores: [".next", "node_modules", "dist", "src/db/migrations"] },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        exports: "writable",
      },
    },
  },
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
      // 每注册一个新业务模块（src/modules/<feature>/），在 zones 数组里加一行：
      //   target 是模块外部（其他模块/app/components/lib/worker）— 这些位置发起的 import
      //   from 是该模块的内部文件（除 index.ts 外）— 不允许直接被外部 import
      // 模块内文件互相 import 不受限，但模块外只能进 index.ts。
      // 注意：permissions 模块内部允许 import @/db/* 和 @/lib/*（基础设施）。
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(permissions)/**",
              ],
              from: "./src/modules/permissions/!(index|server).ts",
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
