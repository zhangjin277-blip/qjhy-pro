// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  { ignores: [".next", "node_modules", "dist", "src/db/migrations", ".claude/worktrees/**"] },
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
  {
    // scripts/ 下的 .mjs 是独立运行的 Node 脚本(非 Next.js 应用代码),需要 Node/Web 全局
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
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
                "./src/modules/!(material-library)/**",
              ],
              from: "./src/modules/material-library/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
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
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(aliases)/**",
              ],
              from: "./src/modules/aliases/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(anchors)/**",
              ],
              from: "./src/modules/anchors/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(brokers)/**",
              ],
              from: "./src/modules/brokers/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(crawler)/**",
              ],
              from: "./src/modules/crawler/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(dashboard)/**",
              ],
              from: "./src/modules/dashboard/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(column-presets)/**",
              ],
              from: "./src/modules/column-presets/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(live-account)/**",
              ],
              from: "./src/modules/live-account/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(live-anchor)/**",
              ],
              from: "./src/modules/live-anchor/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(live-room)/**",
              ],
              from: "./src/modules/live-room/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(placement)/**",
              ],
              from: "./src/modules/placement/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(schedule-override)/**",
              ],
              from: "./src/modules/schedule-override/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(placement-attribution)/**",
              ],
              from: "./src/modules/placement-attribution/!(server).ts",
              message: "placement-attribution 是纯 server-only 模块，只允许 import server.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(invite-codes)/**",
              ],
              from: "./src/modules/invite-codes/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(checkin)/**",
              ],
              from: "./src/modules/checkin/!(index|queries|server).ts",
              message: "跨模块只允许 import 对方的 index.ts / server.ts / queries.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(software-library)/**",
              ],
              from: "./src/modules/software-library/!(index|server).ts",
              message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
            },
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/worker/**",
                "./src/modules/!(recording)/**",
              ],
              from: "./src/modules/recording/!(index|server).ts",
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
