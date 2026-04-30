# Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the QJHY-Pro project skeleton with all conventions, tooling, and infrastructure in place — so any business module built on top inherits the rules automatically (no opportunity to recreate the legacy mid-platform's "spaghetti").

**Architecture:** Single-repo Next.js 16 monorepo. Two Docker containers (web + worker) sharing one PostgreSQL. All enforcement (TypeScript strict, ESLint cross-module restrictions, Zod parse, Drizzle migrations, pre-commit hooks, commitlint) is wired BEFORE the first business module is written. By the end of Phase 0, `docker-compose up` brings up an empty-but-runnable system, with DingTalk OAuth login + emergency backdoor working.

**Tech Stack:** Next.js 16 (App Router + RSC + Server Actions) · TypeScript strict · Tailwind v4 · shadcn/ui · Drizzle ORM · PostgreSQL 16 · Zod · better-auth · Husky · commitlint · Docker Compose · pnpm.

**Reference Spec:** `/Users/zhangjin/qjhy-pro/docs/superpowers/specs/2026-04-30-qjhy-pro-design.md`

---

## File Structure (created/modified by Phase 0)

```
qjhy-pro/
├── .gitignore                          [exists]
├── .env.example                        [Task 11]
├── .editorconfig                       [Task 1]
├── .nvmrc                              [Task 1]
├── package.json                        [Task 1, modified throughout]
├── pnpm-lock.yaml                      [auto]
├── tsconfig.json                       [Task 1]
├── next.config.ts                      [Task 1]
├── eslint.config.mjs                   [Task 3]
├── .prettierrc                         [Task 4]
├── .prettierignore                     [Task 4]
├── commitlint.config.cjs               [Task 6]
├── drizzle.config.ts                   [Task 9]
├── docker-compose.yml                  [Task 8, modified Task 19]
├── Dockerfile.web                      [Task 20]
├── Dockerfile.worker                   [Task 20]
├── README.md                           [Task 23]
├── CONTRIBUTING.md                     [Task 7]
├── .husky/
│   ├── pre-commit                      [Task 5]
│   └── commit-msg                      [Task 6]
├── docs/
│   ├── superpowers/
│   │   ├── specs/2026-04-30-qjhy-pro-design.md  [exists]
│   │   └── plans/2026-04-30-phase-0-foundation.md [this file]
│   └── raw-samples/
│       ├── README.md                   [Task 21]
│       ├── douyin-session-sample.md    [Task 21]
│       └── kuaishou-session-sample.md  [Task 22]
└── src/
    ├── app/
    │   ├── layout.tsx                  [Task 1]
    │   ├── page.tsx                    [Task 1, modified Task 17]
    │   ├── globals.css                 [Task 2]
    │   ├── (auth)/
    │   │   └── login/
    │   │       └── page.tsx            [Task 16]
    │   ├── (dashboard)/
    │   │   ├── layout.tsx              [Task 17]
    │   │   └── dashboard/
    │   │       └── page.tsx            [Task 17]
    │   └── api/
    │       └── auth/
    │           └── [...all]/
    │               └── route.ts        [Task 14]
    ├── components/
    │   └── ui/                         [Task 2, populated as needed]
    ├── db/
    │   ├── client.ts                   [Task 9]
    │   ├── schema/
    │   │   └── index.ts                [Task 10]
    │   └── migrations/                 [auto, Task 10]
    ├── lib/
    │   ├── env.ts                      [Task 11]
    │   ├── errors/
    │   │   ├── app-error.ts            [Task 12]
    │   │   └── index.ts                [Task 12]
    │   ├── notify/
    │   │   ├── dingtalk-bot.ts         [Task 13]
    │   │   └── index.ts                [Task 13]
    │   ├── auth/
    │   │   ├── config.ts               [Task 14]
    │   │   ├── dingtalk-provider.ts    [Task 15]
    │   │   ├── emergency-login.ts      [Task 14]
    │   │   └── index.ts                [Task 14]
    │   └── utils/
    │       └── cn.ts                   [Task 2]
    └── worker/
        ├── index.ts                    [Task 18]
        └── scheduler.ts                [Task 18]
```

**Cross-cutting principles enforced by Phase 0:**

- Cross-module imports only via `index.ts` (ESLint `import/no-restricted-paths`)
- All env vars validated via Zod schema at startup (`src/lib/env.ts`)
- All errors thrown as `AppError` with code (`src/lib/errors/`)
- All Server Action inputs Zod-parsed (enforced in CONTRIBUTING.md, custom lint rule deferred to Phase 1)
- All schema changes go through Drizzle migrations
- All commits go through pre-commit (typecheck + lint + format) and commitlint

---

## Task 1: 初始化 Next.js 16 项目骨架

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.editorconfig`, `.nvmrc`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [x] **Step 1: 在 qjhy-pro 目录里初始化 Next.js 16 项目**

```bash
cd /Users/zhangjin/qjhy-pro
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-pnpm \
  --no-eslint \
  --turbopack \
  --skip-install
```

Expected: 文件被覆盖前会问"directory not empty, continue?" → y。生成 `package.json`、`tsconfig.json`、`next.config.ts`、`src/app/layout.tsx`、`src/app/page.tsx`、`src/app/globals.css`。

如果交互不便（在 agent 里），改用 `--yes` 跳过所有确认。

- [x] **Step 2: 安装依赖**

```bash
cd /Users/zhangjin/qjhy-pro
pnpm install
```

Expected: 几十个包被装好，`pnpm-lock.yaml` 生成。

- [x] **Step 3: 修改 `tsconfig.json` 启用 strict 全部开关**

把 `compilerOptions` 改为：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [x] **Step 4: 创建 `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [x] **Step 5: 创建 `.nvmrc`（锁定 Node 版本）**

```
20
```

- [x] **Step 6: 验证编译可通过**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 errors。如有错误（比如未使用变量），修到通过。

- [x] **Step 7: 验证 dev server 能启动**

```bash
pnpm dev
```

Expected: `▲ Next.js 16.x` 启动信息，`http://localhost:3000` 可访问。手动 Ctrl+C 关闭。

- [x] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts \
        .editorconfig .nvmrc src/ public/ next-env.d.ts postcss.config.mjs
git commit -m "chore: bootstrap Next.js 16 with strict TypeScript"
```

---

## Task 2: 配置 Tailwind v4 + shadcn/ui

**Files:**
- Create: `src/lib/utils/cn.ts`, `components.json`, `src/components/ui/button.tsx` (sample)
- Modify: `src/app/globals.css`

- [x] **Step 1: 安装 shadcn/ui 必备依赖**

```bash
cd /Users/zhangjin/qjhy-pro
pnpm add class-variance-authority clsx tailwind-merge lucide-react
pnpm add -D @types/node
```

- [x] **Step 2: 创建 `src/lib/utils/cn.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [x] **Step 3: 初始化 shadcn/ui**

```bash
pnpm dlx shadcn@latest init
```

交互回答：
- Style: `Default`
- Base color: `Slate`（或 `Zinc`，按喜好）
- CSS variables: `Yes`

Expected: 生成 `components.json`，更新 `src/app/globals.css`。

- [x] **Step 4: 装 Button 组件验证 shadcn 工作**

```bash
pnpm dlx shadcn@latest add button
```

Expected: 生成 `src/components/ui/button.tsx`。

- [x] **Step 4.5: 应用 QJHY-Pro design tokens（覆盖 shadcn 默认色）**

设计 token 完整定义见 [`docs/design/tokens.md`](../../design/tokens.md)。基于真实百应（抖音公会管理后台）UI 截图分析得出的字节 Semi Design 风格。

把 `src/app/globals.css` **整个替换**为以下内容：

```css
@import "tailwindcss";

/* ========== Primitives ========== */
@theme {
  /* 蓝色 scale - 字节蓝，主色调 */
  --color-blue-50:  #EBF1FF;
  --color-blue-100: #D6E4FF;
  --color-blue-200: #ADC8FF;
  --color-blue-300: #85ADFF;
  --color-blue-400: #5C8AFF;
  --color-blue-500: #4080FF;
  --color-blue-600: #2B5CFF;
  --color-blue-700: #1947FA;
  --color-blue-800: #0E32CC;
  --color-blue-900: #0A2399;

  /* 灰色 scale - 中性 11 级 */
  --color-gray-0:   #FFFFFF;
  --color-gray-50:  #F7F8FA;
  --color-gray-100: #F2F3F5;
  --color-gray-200: #E5E6EB;
  --color-gray-300: #C9CDD4;
  --color-gray-400: #86909C;
  --color-gray-500: #6B7785;
  --color-gray-600: #4E5969;
  --color-gray-700: #272E3B;
  --color-gray-800: #1D2129;
  --color-gray-900: #0F1419;

  /* 状态 */
  --color-success: #00B42A;
  --color-warning: #FF7D00;
  --color-danger:  #F53F3F;

  /* 字体 - 中文优先 PingFang SC */
  --font-sans:
    "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei",
    -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;

  /* radius */
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
}

/* ========== Semantic (light) ========== */
:root {
  --background: var(--color-gray-50);
  --foreground: var(--color-gray-800);
  --card: var(--color-gray-0);
  --card-foreground: var(--color-gray-800);
  --popover: var(--color-gray-0);
  --popover-foreground: var(--color-gray-800);
  --primary: var(--color-blue-600);
  --primary-foreground: var(--color-gray-0);
  --secondary: var(--color-gray-100);
  --secondary-foreground: var(--color-gray-700);
  --muted: var(--color-gray-100);
  --muted-foreground: var(--color-gray-400);
  --accent: var(--color-blue-50);
  --accent-foreground: var(--color-blue-700);
  --destructive: var(--color-danger);
  --destructive-foreground: var(--color-gray-0);
  --border: var(--color-gray-200);
  --input: var(--color-gray-200);
  --ring: var(--color-blue-100);

  /* 业务语义 */
  --sidebar: #F2F6FE;
  --change-up: #F53F3F;     /* 涨红 */
  --change-down: #00B42A;   /* 跌绿 */
  --change-flat: var(--color-gray-400);
}

/* ========== Semantic (dark) - Phase 3 完善 ========== */
.dark {
  --background: #0F1419;
  --foreground: var(--color-gray-50);
  --card: #1A1F26;
  --card-foreground: var(--color-gray-50);
  --primary: var(--color-blue-500);
  --primary-foreground: var(--color-gray-50);
  --border: #2A3140;
  --sidebar: #161B23;
}

/* ========== Base 样式 ========== */
* { box-sizing: border-box; }
html, body { font-family: var(--font-sans); }
body {
  background: var(--background);
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 数据 KPI 数字工具类 */
.kpi-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}

/* 涨跌色工具类（中国 B 端：涨红跌绿）*/
.change-up   { color: var(--change-up); }
.change-down { color: var(--change-down); }
.change-flat { color: var(--change-flat); }
```

> ⚠️ **重要**：shadcn init 默认生成的 `globals.css` 用的是它自己的色板（`--primary` 是黑色），必须**整个替换**为以上内容才能让 shadcn 组件用我们的字节蓝。

- [x] **Step 5: 在首页验证 Button 渲染**

修改 `src/app/page.tsx`：

```tsx
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-bold">QJHY-Pro</h1>
        <p className="text-muted-foreground">新中台 · Phase 0 骨架</p>

        {/* Token 应用验证：按钮 + KPI 数字 + 涨跌色 */}
        <div className="flex gap-3 justify-center">
          <Button>主按钮</Button>
          <Button variant="secondary">次要</Button>
          <Button variant="outline">轮廓</Button>
          <Button variant="ghost">幽灵</Button>
        </div>

        <div className="rounded-lg bg-card p-6 shadow-sm border text-left max-w-sm mx-auto">
          <p className="text-sm text-muted-foreground">音浪</p>
          <p className="kpi-value">12.34万</p>
          <p className="text-sm text-muted-foreground mt-1">
            昨日同期 10.59万 <span className="change-up">+16% ▲</span>
          </p>
          <p className="text-sm text-muted-foreground">
            上周同期 16.00万 <span className="change-down">-23% ▼</span>
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [x] **Step 6: 启动 dev 验证 design tokens 已生效**

```bash
pnpm dev
```

打开 `http://localhost:3000`，应看到：
- ✅ 主按钮是**字节蓝** `#2B5CFF`（不是 shadcn 默认黑色）
- ✅ 整页背景**浅灰** `#F7F8FA`（不是纯白）
- ✅ 卡片白底 + 极轻阴影 + `8px` 圆角
- ✅ "12.34万" 是大字号粗体（`32px / 700`）
- ✅ "+16% ▲" **红色**（中国习惯：涨红）
- ✅ "-23% ▼" **绿色**（中国习惯：跌绿）
- ✅ 中文用 PingFang SC（macOS 上）

如有问题，检查 `src/app/globals.css` 是否完整替换。

Ctrl+C 关闭 dev。

- [x] **Step 7: Commit**

```bash
git add src/lib/utils/cn.ts components.json src/components src/app/page.tsx src/app/globals.css package.json pnpm-lock.yaml
git commit -m "feat: add Tailwind + shadcn/ui with QJHY-Pro design tokens

- Apply Bytedance Semi Design inspired palette (字节蓝 #2B5CFF)
- Sidebar bg, KPI typography scale, China-convention 涨红跌绿 colors
- Override shadcn defaults via CSS variables in globals.css
- Reference: docs/design/tokens.md"
```

---

## Task 3: 配置 ESLint + 跨模块 import 限制

**Files:**
- Create: `eslint.config.mjs`

- [x] **Step 1: 安装 ESLint + 必备插件**

```bash
pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-import \
            eslint-plugin-react eslint-plugin-react-hooks \
            @next/eslint-plugin-next eslint-import-resolver-typescript
```

- [x] **Step 2: 创建 `eslint.config.mjs`**

```javascript
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
      // 跨模块 import 必须走 index.ts (CRITICAL — 屎山防护)
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
```

- [x] **Step 3: 在 `package.json` 加 lint script**

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix"
  }
}
```

- [x] **Step 4: 运行 lint 验证**

```bash
pnpm lint
```

Expected: 0 errors, 0 warnings（如果有，修到 0）。

- [x] **Step 5: 写一个故意违规的 import 验证 `no-restricted-paths` 工作**

临时创建 `src/modules/_test_a/index.ts`:
```typescript
export const a = 1;
```

临时创建 `src/modules/_test_b/index.ts`：
```typescript
export const b = 2;
```

临时创建 `src/modules/_test_b/internal.ts`：
```typescript
export const internal = 'should not be imported';
```

临时创建 `src/modules/_test_a/violation.ts`：
```typescript
import { internal } from "../_test_b/internal"; // 应该报错
console.log(internal);
```

```bash
pnpm lint
```

Expected: 报错 "跨模块只允许 import 对方的 index.ts"。

- [x] **Step 6: 删除测试文件**

```bash
rm -rf src/modules/_test_a src/modules/_test_b
```

- [x] **Step 7: Commit**

```bash
git add eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "chore: configure ESLint with cross-module import restrictions"
```

---

## Task 4: 配置 Prettier

**Files:**
- Create: `.prettierrc`, `.prettierignore`

- [x] **Step 1: 安装 Prettier**

```bash
pnpm add -D prettier
```

- [x] **Step 2: 创建 `.prettierrc`**

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [x] **Step 3: 创建 `.prettierignore`**

```
.next
node_modules
dist
build
pnpm-lock.yaml
src/db/migrations
*.md
```

- [x] **Step 4: 在 `package.json` 加 format script**

```json
{
  "scripts": {
    "format": "prettier --check .",
    "format:fix": "prettier --write ."
  }
}
```

- [x] **Step 5: 跑一次 format:fix**

```bash
pnpm format:fix
```

Expected: 所有文件被格式化。

- [x] **Step 6: 验证 format 通过**

```bash
pnpm format
```

Expected: "All matched files use Prettier code style!"

- [x] **Step 7: Commit**

```bash
git add .prettierrc .prettierignore package.json pnpm-lock.yaml src/
git commit -m "chore: configure Prettier"
```

---

## Task 5: 配置 Husky + lint-staged 强制 pre-commit 检查

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json`

- [x] **Step 1: 安装 Husky + lint-staged**

```bash
pnpm add -D husky lint-staged
pnpm exec husky init
```

Expected: 创建 `.husky/` 目录和 `.husky/pre-commit`。`package.json` 自动加上 `"prepare": "husky"`。

- [x] **Step 2: 替换 `.husky/pre-commit` 内容**

```bash
#!/usr/bin/env sh

echo "🔍 Pre-commit checks..."
pnpm exec lint-staged
echo "🔍 Type checking..."
pnpm exec tsc --noEmit
echo "✅ Pre-commit passed"
```

- [x] **Step 3: 在 `package.json` 加 lint-staged 配置**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "prettier --write",
      "eslint --fix --max-warnings=0"
    ],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

- [x] **Step 4: 验证 hook 工作**

故意改一个文件加点格式问题：

```bash
echo "const x =1" >> src/lib/utils/cn.ts  # 故意没有空格
git add src/lib/utils/cn.ts
git commit -m "test: trigger pre-commit"
```

Expected: pre-commit 自动 format + lint，commit 成功（因为是自动修复的）。

- [x] **Step 5: 撤销测试改动**

```bash
git revert --no-commit HEAD
git checkout src/lib/utils/cn.ts
git restore --staged src/lib/utils/cn.ts
```

或更直接：

```bash
git reset --hard HEAD~1
```

⚠️ 仅在确认上一个 commit 是测试 commit 时使用。

- [x] **Step 6: Commit hook 配置**

```bash
git add .husky package.json pnpm-lock.yaml
git commit -m "chore: add Husky pre-commit hook with lint-staged"
```

---

## Task 6: 配置 commitlint 强制提交规范

**Files:**
- Create: `commitlint.config.cjs`, `.husky/commit-msg`

- [x] **Step 1: 安装 commitlint**

```bash
pnpm add -D @commitlint/cli @commitlint/config-conventional
```

- [x] **Step 2: 创建 `commitlint.config.cjs`**

```javascript
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "ci", "build", "revert"],
    ],
    "subject-case": [0],
    "subject-max-length": [2, "always", 100],
  },
};
```

- [x] **Step 3: 创建 `.husky/commit-msg`**

```bash
#!/usr/bin/env sh
pnpm exec commitlint --edit $1
```

```bash
chmod +x .husky/commit-msg
```

- [x] **Step 4: 验证 commitlint 工作**

```bash
echo "" > /tmp/bad-msg
git commit --allow-empty --file=/tmp/bad-msg 2>&1 | tee /tmp/result
```

Expected: commit 失败，报"subject may not be empty"。

```bash
git commit --allow-empty -m "bad message format"
```

Expected: 失败，报"type may not be empty"。

```bash
git commit --allow-empty -m "test: commitlint works"
```

Expected: 成功。

- [x] **Step 5: Commit 测试 commit**

刚才的 `test: commitlint works` 已经 commit 了。如果要保留 git history 干净，可以 reset。但既然是合法的，留着也行：

```bash
git log --oneline -1
```

Expected: 看到 `test: commitlint works`。

- [x] **Step 6: Commit 配置文件**

```bash
git add commitlint.config.cjs .husky/commit-msg package.json pnpm-lock.yaml
git commit -m "chore: enforce conventional commits with commitlint"
```

---

## Task 7: 写 CONTRIBUTING.md（开发规范，强制）

**Files:**
- Create: `CONTRIBUTING.md`

- [x] **Step 1: 创建 `CONTRIBUTING.md`**

完整内容（直接写）：

```markdown
# 贡献指南 (CONTRIBUTING)

> **本文档是 QJHY-Pro 的"宪法"**——任何提交（人或 AI）必须先读完此文档。
> 违反此规范的代码会被 ESLint / TypeScript / pre-commit hook 拒绝。

参考设计文档：[`docs/superpowers/specs/2026-04-30-qjhy-pro-design.md`](./docs/superpowers/specs/2026-04-30-qjhy-pro-design.md)

## 1. 命名规范

- 文件名：`kebab-case`（`anchor-profile.ts`）
- 变量/函数：`camelCase`
- 类/类型/接口：`PascalCase`
- 常量：`SCREAMING_SNAKE_CASE`
- 数据库表/列：`snake_case`
- 错误码：`SCREAMING_SNAKE_CASE` 格式 `{MODULE}_{TYPE}_{REASON}`，例：`ANCHOR_NOT_FOUND`

## 2. 文件结构规则

- **一个业务功能 = 一个 `src/modules/[feature]/` 文件夹**
- 每个模块**必须**有 `index.ts` 暴露公开 API
- 模块之间**只能** `import` 对方的 `index.ts`（ESLint 强制）
- **不允许**在 `src/app/` 里直接写业务逻辑（仅用作页面/路由）

## 3. TypeScript / Zod 规则

- TypeScript strict mode 必开（已配）
- **严禁** `any`（除非有 `// eslint-disable-next-line` + 详细理由）
- 所有 Server Action / Route Handler 必须以 `Schema.parse(input)` 开头
- TypeScript 类型从 Zod 推导（`z.infer`），**不重复定义类型**

## 4. 数据库 / Migration 规则

- 任何 schema 改动必须走 Drizzle migration（`pnpm db:generate` + `pnpm db:migrate`）
- **事实数据表必须有 `raw: jsonb` 字段**（爬虫表强制）
- **落库时严禁字段重命名、翻译、换算**（屎山防护核心）
- 数据查询必须经过 `applyScopeFilter`（除明确的管理员接口）

## 5. 错误处理规则

- **不允许** `throw new Error(...)`，必须 `throw new AppError(code, message, httpStatus)`
- 错误码格式 `{MODULE}_{TYPE}_{REASON}`
- 关键错误必须发钉钉机器人通知（含"报错"关键词）

## 6. Git / Commit 规则

- Conventional Commits（已用 commitlint 强制）
- 一个 commit 一个目的，**不混合修改**
- **严禁** `git commit --no-verify` 绕过 pre-commit hook
- **严禁**把 secret（token / 密码 / webhook）写进代码或 commit

## 7. 加新功能的标准动作

```bash
# 1. 创建模块
mkdir src/modules/[feature]

# 2. 标准文件
src/modules/[feature]/
├── schema.ts        # Zod 规则（必有）
├── actions.ts       # Server Actions
├── components/      # 前端组件
├── index.ts         # 对外 export（必有）
└── README.md        # 模块说明

# 3. 数据库 migration（如果有新表）
src/db/schema/[feature].ts
pnpm db:generate
pnpm db:migrate

# 4. 在导航/路由加入口
src/app/(dashboard)/[feature]/page.tsx

# 5. 在本文件第 8 节 "已注册模块" 加一行
```

## 8. 已注册模块清单

| 模块 | 路径 | 简介 | 注册时间 |
|---|---|---|---|
| (Phase 0 暂无业务模块) | - | - | - |

> 每加一个模块，PR 里必须更新此表。

## 9. Code Review 检查清单

- [x] 新增功能是否在 `src/modules/[feature]/`？
- [x] 是否所有 Server Action 都 `Schema.parse()`？
- [x] 是否有跨模块 import 内部文件？（ESLint 已挡）
- [x] 是否有 `any` / `as any` 偷懒？
- [x] 数据查询是否经过 `applyScopeFilter`？
- [x] 错误是否用 `AppError`？
- [x] commit message 是否规范？

## 10. 严禁事项（MUST NOT）

| 严禁 | 后果 |
|---|---|
| ❌ `throw new Error()` | 用 AppError 替代 |
| ❌ 跨模块 import 内部文件 | ESLint 报错 |
| ❌ 落库前翻译字段 | 整个项目的核心反模式 |
| ❌ 在数据库 schema 改字段名为中文 | 用 field_alias 配置 |
| ❌ `--no-verify` 绕过 hook | 一旦发现，要求重写 commit |
| ❌ 把 token/密码写进代码 | 用 `.env` |
| ❌ `as any` 偷懒 | 加 Zod 校验 |

## 11. 钉钉机器人 webhook

- 配置在 `.env` 文件：`DINGTALK_BOT_WEBHOOK=...`
- 关键词："报错"
- 严禁把真实 token 写进任何代码、文档、commit
```

- [x] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING guidelines (project constitution)"
```

---

## Task 8: 创建 Docker Compose（先只跑 Postgres）

**Files:**
- Create: `docker-compose.yml`

- [x] **Step 1: 创建 `docker-compose.yml`**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: qjhy-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: qjhy
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-qjhy_dev_password}
      POSTGRES_DB: qjhy
    ports:
      - "5432:5432"
    volumes:
      - qjhy_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U qjhy -d qjhy"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  qjhy_postgres_data:
```

- [x] **Step 2: 启动 Postgres 容器**

```bash
docker-compose up -d postgres
```

Expected: 容器启动，5-10 秒后 health check 通过。

- [x] **Step 3: 验证可连接**

```bash
docker exec qjhy-postgres pg_isready -U qjhy -d qjhy
```

Expected: `accepting connections`。

- [x] **Step 4: 用 psql 验证**

```bash
docker exec -it qjhy-postgres psql -U qjhy -d qjhy -c "SELECT version();"
```

Expected: 看到 PostgreSQL 16.x 版本信息。

- [x] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add Docker Compose with Postgres 16"
```

---

## Task 9: 配置 Drizzle ORM + 接 Postgres

**Files:**
- Create: `drizzle.config.ts`, `src/db/client.ts`
- Modify: `package.json`

- [x] **Step 1: 安装 Drizzle**

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

- [x] **Step 2: 创建 `drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://qjhy:qjhy_dev_password@localhost:5432/qjhy",
  },
  strict: true,
  verbose: true,
});
```

- [x] **Step 3: 创建 `src/db/client.ts`**

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://qjhy:qjhy_dev_password@localhost:5432/qjhy";

const queryClient = postgres(connectionString, {
  max: 10,
  prepare: false,
});

export const db = drizzle(queryClient);
export type Db = typeof db;
```

- [x] **Step 4: 在 `package.json` 加 db scripts**

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [x] **Step 5: 验证连接（用 db:studio 短测）**

```bash
pnpm db:studio
```

Expected: Drizzle Studio 在 https://local.drizzle.studio 启动，连接 Postgres 成功（数据库为空）。Ctrl+C 关闭。

- [x] **Step 6: Commit**

```bash
git add drizzle.config.ts src/db/client.ts package.json pnpm-lock.yaml
git commit -m "feat: configure Drizzle ORM with PostgreSQL"
```

---

## Task 10: 第一个占位 schema + migration

**Files:**
- Create: `src/db/schema/index.ts`, `src/db/schema/_meta.ts`

- [x] **Step 1: 创建 `src/db/schema/_meta.ts`（占位 + 健康检查表）**

```typescript
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 元信息表 - 用于健康检查和 schema 版本追踪
 * 不是业务表，仅记录"系统状态"
 */
export const _meta = pgTable("_meta", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
```

- [x] **Step 2: 创建 `src/db/schema/index.ts`**

```typescript
export * from "./_meta";
```

- [x] **Step 3: 生成 migration**

```bash
pnpm db:generate
```

Expected: `src/db/migrations/0000_xxx.sql` 生成，包含 CREATE TABLE _meta。

- [x] **Step 4: 跑 migration**

```bash
pnpm db:migrate
```

Expected: 输出 "Applied migrations"。

- [x] **Step 5: 验证表存在**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\dt"
```

Expected: 看到 `_meta` 表。

- [x] **Step 6: 在 `_meta` 表插入一条版本记录**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c \
  "INSERT INTO _meta(key, value) VALUES('schema_version', '0.1.0-phase0');"
```

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT * FROM _meta;"
```

Expected: 返回一行 `schema_version | 0.1.0-phase0`。

- [x] **Step 7: Commit**

```bash
git add src/db/schema src/db/migrations
git commit -m "feat: add _meta placeholder schema and first migration"
```

---

## Task 11: env 加载和 Zod 校验

**Files:**
- Create: `src/lib/env.ts`, `.env.example`, `.env.local`

- [x] **Step 1: 安装 Zod**

```bash
pnpm add zod
```

- [x] **Step 2: 创建 `.env.example`**

```bash
# Database
DATABASE_URL=postgresql://qjhy:qjhy_dev_password@localhost:5432/qjhy

# DingTalk OAuth (Phase 1 配置真实值)
DINGTALK_APP_KEY=
DINGTALK_APP_SECRET=
DINGTALK_CORP_ID=

# DingTalk Bot Webhook (报错通知，必须含关键词"报错"才能发送)
DINGTALK_BOT_WEBHOOK=

# Auth
AUTH_SECRET=
EMERGENCY_LOGIN_PASSWORD=

# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [x] **Step 3: 创建 `.env.local`（本地实际配置，不进 git）**

```bash
DATABASE_URL=postgresql://qjhy:qjhy_dev_password@localhost:5432/qjhy
DINGTALK_BOT_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=YOUR_REAL_TOKEN_HERE
AUTH_SECRET=$(openssl rand -base64 32)
EMERGENCY_LOGIN_PASSWORD=$(openssl rand -base64 24)
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
DINGTALK_APP_KEY=
DINGTALK_APP_SECRET=
DINGTALK_CORP_ID=
```

⚠️ 实际 `DINGTALK_BOT_WEBHOOK` 用用户提供的真实 token，但**绝不能**进 `.env.example` 或任何 commit。

- [x] **Step 4: 验证 `.env.local` 已被 .gitignore**

```bash
git check-ignore .env.local
```

Expected: 输出 `.env.local`（被忽略）。

- [x] **Step 5: 创建 `src/lib/env.ts`**

```typescript
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DINGTALK_APP_KEY: z.string().default(""),
  DINGTALK_APP_SECRET: z.string().default(""),
  DINGTALK_CORP_ID: z.string().default(""),
  DINGTALK_BOT_WEBHOOK: z.string().url().or(z.literal("")).default(""),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  EMERGENCY_LOGIN_PASSWORD: z.string().min(16, "EMERGENCY_LOGIN_PASSWORD must be at least 16 chars"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
```

- [x] **Step 6: 验证 env 加载**

```bash
pnpm exec tsx --env-file=.env.local -e "import('./src/lib/env').then(({ env }) => console.log('OK:', { db: env.DATABASE_URL.slice(0, 30) }))"
```

如果 tsx 没装，先装：

```bash
pnpm add -D tsx
pnpm exec tsx --env-file=.env.local -e "import('./src/lib/env').then(({ env }) => console.log('OK:', { db: env.DATABASE_URL.slice(0, 30) }))"
```

Expected: 输出 `OK: { db: 'postgresql://qjhy:qjhy_dev_pas' }`。

- [x] **Step 7: 测试缺少必需变量时报错**

```bash
AUTH_SECRET= pnpm exec tsx --env-file=.env.local -e "import('./src/lib/env')"
```

Expected: 报错 "AUTH_SECRET must be at least 16 chars"。

- [x] **Step 8: Commit**

```bash
git add src/lib/env.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat: add Zod-validated env loader (lib/env.ts)"
```

---

## Task 12: AppError 类（统一错误处理）

**Files:**
- Create: `src/lib/errors/app-error.ts`, `src/lib/errors/index.ts`
- Create: `src/lib/errors/app-error.test.ts`（用 vitest 验证 — 装 vitest 留 Phase 1，本任务用简单脚本）

- [x] **Step 1: 创建 `src/lib/errors/app-error.ts`**

```typescript
/**
 * 项目统一错误类型。
 *
 * 严禁直接 `throw new Error(...)`，必须用 AppError 携带 code。
 *
 * 错误码格式：{MODULE}_{TYPE}_{REASON}
 * 例：ANCHOR_NOT_FOUND, DINGTALK_SYNC_FAILED, AUTH_FORBIDDEN_SCOPE
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    httpStatus = 400,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.context = context;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.context ? { context: this.context } : {}),
      },
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
```

- [x] **Step 2: 创建 `src/lib/errors/index.ts`**

```typescript
export { AppError, isAppError } from "./app-error";
```

- [x] **Step 3: 写一个简单验证脚本**

创建 `src/lib/errors/__verify.ts`：

```typescript
import { AppError, isAppError } from "./index";

const err = new AppError("TEST_CODE", "test message", 400, { foo: "bar" });

console.assert(err.code === "TEST_CODE", "code wrong");
console.assert(err.httpStatus === 400, "status wrong");
console.assert(err.message === "test message", "message wrong");
console.assert(isAppError(err) === true, "isAppError wrong");
console.assert(isAppError(new Error()) === false, "isAppError false-positive");
console.assert(JSON.stringify(err.toJSON()).includes("foo"), "toJSON missing context");

console.log("✅ AppError verification passed");
```

```bash
pnpm exec tsx src/lib/errors/__verify.ts
```

Expected: `✅ AppError verification passed`。

- [x] **Step 4: 删除验证脚本（一次性的）**

```bash
rm src/lib/errors/__verify.ts
```

> Phase 1 装 vitest 后，会有正式单元测试。Phase 0 这里只做手动验证。

- [x] **Step 5: Commit**

```bash
git add src/lib/errors
git commit -m "feat: add AppError unified error class with code"
```

---

## Task 13: 钉钉机器人通知封装

**Files:**
- Create: `src/lib/notify/dingtalk-bot.ts`, `src/lib/notify/index.ts`

- [x] **Step 1: 创建 `src/lib/notify/dingtalk-bot.ts`**

```typescript
import { env } from "@/lib/env";
import { AppError, isAppError } from "@/lib/errors";

/**
 * 给钉钉机器人发文本消息。
 *
 * ⚠️ 机器人配置了关键词"报错"，所有消息内容必须包含"报错"二字才能被推送。
 * 内部已自动加前缀，调用方不需要关心。
 */
export async function notifyDingtalk(payload: {
  title: string;
  detail: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  if (!env.DINGTALK_BOT_WEBHOOK) {
    console.warn("[notify] DINGTALK_BOT_WEBHOOK not configured, skip");
    return;
  }

  const lines: string[] = [
    `【报错】${payload.title}`, // ★ 关键词 "报错" 必带
    `详情：${payload.detail}`,
  ];
  if (payload.context && Object.keys(payload.context).length > 0) {
    lines.push(`上下文：${JSON.stringify(payload.context)}`);
  }
  const content = lines.join("\n");

  try {
    const res = await fetch(env.DINGTALK_BOT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content } }),
    });
    if (!res.ok) {
      console.error("[notify] dingtalk webhook returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("[notify] dingtalk fetch failed:", err);
  }
}

/**
 * 把任意错误转成钉钉通知。
 * 用于 worker 任务失败、API 异常等场景的统一上报。
 */
export async function notifyError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  if (isAppError(err)) {
    await notifyDingtalk({
      title: err.code,
      detail: err.message,
      context: { ...err.context, ...context },
    });
  } else if (err instanceof Error) {
    await notifyDingtalk({
      title: "UNHANDLED_ERROR",
      detail: err.message,
      context: { stack: err.stack?.slice(0, 500), ...context },
    });
  } else {
    await notifyDingtalk({
      title: "UNKNOWN_ERROR",
      detail: String(err),
      context,
    });
  }
}
```

- [x] **Step 2: 创建 `src/lib/notify/index.ts`**

```typescript
export { notifyDingtalk, notifyError } from "./dingtalk-bot";
```

- [x] **Step 3: 写一个手动测试脚本**

创建 `src/lib/notify/__verify.ts`：

```typescript
import { notifyDingtalk, notifyError } from "./index";
import { AppError } from "@/lib/errors";

async function main() {
  console.log("Sending test notification...");
  await notifyDingtalk({
    title: "PHASE_0_VERIFICATION",
    detail: "QJHY-Pro Phase 0 钉钉机器人通知验证",
    context: { timestamp: new Date().toISOString() },
  });
  console.log("✅ Plain notify sent");

  await notifyError(new AppError("TEST_ERROR", "测试错误对象转通知"));
  console.log("✅ AppError notify sent");

  console.log("👀 检查你的钉钉群，应收到 2 条消息（含'报错'关键词）");
}

main();
```

```bash
pnpm exec tsx --env-file=.env.local src/lib/notify/__verify.ts
```

Expected: 控制台输出 `✅`，钉钉群里收到 2 条消息（开头是"【报错】"）。

- [x] **Step 4: 删除验证脚本**

```bash
rm src/lib/notify/__verify.ts
```

- [x] **Step 5: Commit**

```bash
git add src/lib/notify
git commit -m "feat: add DingTalk bot notification (with error keyword)"
```

---

## Task 14: 配置 better-auth + 应急后门登录

**Files:**
- Create: `src/lib/auth/config.ts`, `src/lib/auth/emergency-login.ts`, `src/lib/auth/index.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/db/schema/auth.ts`
- Modify: `src/db/schema/index.ts`

- [x] **Step 1: 安装 better-auth**

```bash
pnpm add better-auth
```

- [x] **Step 2: 创建 better-auth 所需的 schema (`src/db/schema/auth.ts`)**

```typescript
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// better-auth 内置用户/会话表（schema 来自官方文档）

export const auth_user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auth_session = pgTable("auth_session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => auth_user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auth_account = pgTable("auth_account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => auth_user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auth_verification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [x] **Step 3: 在 `src/db/schema/index.ts` 加 `export * from "./auth"`**

```typescript
export * from "./_meta";
export * from "./auth";
```

- [x] **Step 4: 生成并跑 migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: 新建 4 张表。

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\dt"
```

应看到 `auth_user`, `auth_session`, `auth_account`, `auth_verification`, `_meta`。

- [x] **Step 5: 创建 `src/lib/auth/config.ts`**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { env } from "@/lib/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: env.AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  emailAndPassword: {
    enabled: true, // 用于应急后门
    autoSignIn: true,
  },
  // 钉钉 OAuth 在 Task 15 加
});

export type Auth = typeof auth;
```

- [x] **Step 6: 创建 `src/lib/auth/emergency-login.ts`**

```typescript
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { notifyDingtalk } from "@/lib/notify";

const EMERGENCY_USER_ID = "emergency-admin";
const EMERGENCY_USER_EMAIL = "emergency@qjhy.local";

/**
 * 应急后门登录校验。
 * 仅在钉钉登录不可用时使用，所有调用都会被钉钉机器人通知。
 */
export async function verifyEmergencyPassword(password: string): Promise<boolean> {
  if (!password || password !== env.EMERGENCY_LOGIN_PASSWORD) {
    return false;
  }

  // 通知（异步，失败不阻塞登录）
  notifyDingtalk({
    title: "EMERGENCY_LOGIN",
    detail: `应急账号登录成功 - 请确认是否为本人操作`,
    context: { timestamp: new Date().toISOString() },
  }).catch(() => {});

  return true;
}

export const EMERGENCY_USER = {
  id: EMERGENCY_USER_ID,
  email: EMERGENCY_USER_EMAIL,
  name: "Emergency Admin",
};

export function isEmergencyUser(userId: string | undefined): boolean {
  return userId === EMERGENCY_USER_ID;
}
```

- [x] **Step 7: 创建 `src/lib/auth/index.ts`**

```typescript
export { auth, type Auth } from "./config";
export { verifyEmergencyPassword, isEmergencyUser, EMERGENCY_USER } from "./emergency-login";
```

- [x] **Step 8: 创建 better-auth 路由 `src/app/api/auth/[...all]/route.ts`**

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

- [x] **Step 9: 验证 typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 errors。

- [x] **Step 10: 启动 dev 验证 auth 路由**

```bash
pnpm dev
```

测试访问：
```bash
curl -i http://localhost:3000/api/auth/get-session
```

Expected: HTTP 200，body 是 JSON（可能是 `null` 或空 session）。Ctrl+C 关闭 dev。

- [x] **Step 11: Commit**

```bash
git add src/lib/auth src/app/api src/db/schema src/db/migrations package.json pnpm-lock.yaml
git commit -m "feat: integrate better-auth with emergency backdoor login"
```

---

## Task 15: 钉钉 OAuth provider（占位接入，token 留空 Phase 1 配置）

**Files:**
- Create: `src/lib/auth/dingtalk-provider.ts`
- Modify: `src/lib/auth/config.ts`

> 此 Task 只是把"钉钉 OAuth provider 的代码骨架"放进 better-auth 配置。
> 真实 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET` 由用户在钉钉开发者后台申请后填进 `.env.local`。
> Phase 0 验收时**钉钉登录可以暂不实际工作**，只要应急登录工作即可。Phase 1 时配真实 token 后再验。

- [x] **Step 1: 创建 `src/lib/auth/dingtalk-provider.ts`**

```typescript
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * 钉钉 OAuth provider 配置。
 * 文档：https://open.dingtalk.com/document/orgapp/scan-code-login-third-party-website
 *
 * Phase 0：占位，token 为空时跳过注册。
 * Phase 1：用户在钉钉开发者后台创建小程序/H5 应用后，填入真实 token。
 */
export interface DingtalkProfile {
  unionid: string;
  openid: string;
  nick: string;
  avatarUrl: string;
  mobile?: string;
}

export const dingtalkProvider = {
  id: "dingtalk",
  name: "DingTalk",
  authorizationUrl: "https://login.dingtalk.com/oauth2/auth",
  tokenUrl: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
  userInfoUrl: "https://api.dingtalk.com/v1.0/contact/users/me",
  clientId: env.DINGTALK_APP_KEY,
  clientSecret: env.DINGTALK_APP_SECRET,
  scopes: ["openid", "corpid"],
  redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/dingtalk`,

  // 把钉钉返回的 profile 映射成 better-auth 的 user
  mapProfileToUser(profile: DingtalkProfile) {
    return {
      id: profile.unionid,
      email: `${profile.unionid}@dingtalk.local`, // 钉钉 OAuth 拿不到邮箱，用 unionid 兜底
      name: profile.nick,
      image: profile.avatarUrl,
      emailVerified: true,
    };
  },
};

export function isDingtalkProviderConfigured(): boolean {
  return Boolean(env.DINGTALK_APP_KEY && env.DINGTALK_APP_SECRET);
}
```

- [x] **Step 2: 修改 `src/lib/auth/config.ts` 接入钉钉 provider（条件注册）**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { dingtalkProvider, isDingtalkProviderConfigured } from "./dingtalk-provider";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: env.AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  emailAndPassword: {
    enabled: true, // 应急后门
    autoSignIn: true,
  },
  socialProviders: isDingtalkProviderConfigured()
    ? {
        // better-auth 不内置钉钉，需用 generic OAuth provider 接入
        // Phase 1 时根据 better-auth 的 generic OAuth 文档完成完整对接
        // 目前先留 placeholder，typecheck 通过即可
      }
    : {},
});

export type Auth = typeof auth;
```

> ⚠️ **此处实施提示**：better-auth 的 generic OAuth 集成方式可能随版本变化。Phase 0 只保留占位，Phase 1 再根据 better-auth 当时最新文档（用 context7 查最新版）完成对接。Phase 0 验收以"应急登录工作"为标准。

- [x] **Step 3: 验证 typecheck 仍通过**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 errors。

- [x] **Step 4: Commit**

```bash
git add src/lib/auth
git commit -m "feat: scaffold DingTalk OAuth provider (Phase 1 will complete integration)"
```

---

## Task 16: 创建登录页

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [x] **Step 1: 安装 Form 相关组件**

```bash
pnpm dlx shadcn@latest add input label card
```

- [x] **Step 2: 创建 `src/app/(auth)/login/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmergencyLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "emergency@qjhy.local",
          password,
        }),
      });
      if (!res.ok) {
        setError("应急密码错误");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("登录失败");
    } finally {
      setLoading(false);
    }
  }

  function handleDingtalkLogin() {
    // Phase 1 完整接入后启用
    setError("钉钉登录将在 Phase 1 启用。请使用应急登录。");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>QJHY-Pro 登录</CardTitle>
          <CardDescription>使用钉钉扫码或应急账号登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleDingtalkLogin} className="w-full" variant="default">
            钉钉扫码登录（Phase 1 启用）
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">应急通道</span>
            </div>
          </div>

          <form onSubmit={handleEmergencyLogin} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="emergency-password">应急密码</Label>
              <Input
                id="emergency-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="EMERGENCY_LOGIN_PASSWORD"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} variant="outline" className="w-full">
              {loading ? "登录中..." : "应急登录"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            应急登录会触发钉钉机器人通知。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [x] **Step 3: 在数据库手工建一个应急用户（一次性 seed）**

由于 better-auth 用 email/password，需要先在数据库里创建应急用户。最简单方法：通过 sign-up API。

启动 dev：
```bash
pnpm dev
```

新开 terminal：

```bash
EMERGENCY_PWD=$(grep EMERGENCY_LOGIN_PASSWORD .env.local | cut -d= -f2)
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"emergency@qjhy.local\",\"password\":\"$EMERGENCY_PWD\",\"name\":\"Emergency Admin\"}"
```

Expected: HTTP 200，返回 user 对象。

> 注：实际生产部署时，应通过专用 seed 脚本创建（Task 23 会做）。这里临时手工。

- [x] **Step 4: 访问登录页验证**

浏览器打开 `http://localhost:3000/login`，应看到登录卡片。

- [x] **Step 5: 用应急密码登录**

输入 `.env.local` 里的 `EMERGENCY_LOGIN_PASSWORD`，点"应急登录"。

Expected: 跳转到 `/dashboard`（即将在 Task 17 创建）。如果 Task 17 还没做，会 404，**这是预期的**——只要登录成功（看到 cookie 被 set 即可）。

- [x] **Step 6: 验证应急登录通知**

钉钉群应**不会**收到通知——因为通知逻辑写在 `verifyEmergencyPassword` 里，但 better-auth 走的是它自己的 email/password 流程。这个集成在 Phase 1 完善（需要写 better-auth 的钩子）。**Phase 0 暂不强制此通知**。

- [x] **Step 7: 关闭 dev，commit**

```bash
# Ctrl+C 关闭 dev

git add src/app src/components
git commit -m "feat: add login page with emergency login form"
```

---

## Task 17: Dashboard 占位页面

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/app/page.tsx`

- [x] **Step 1: 创建 dashboard 布局 `src/app/(dashboard)/layout.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">QJHY-Pro</h1>
          <div className="text-sm text-muted-foreground">
            {session.user.name}
            <form action="/api/auth/sign-out" method="POST" className="inline ml-4">
              <button type="submit" className="text-primary hover:underline">
                退出
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [x] **Step 2: 创建 dashboard 首页 `src/app/(dashboard)/dashboard/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <Card>
        <CardHeader>
          <CardTitle>Phase 0 占位首页</CardTitle>
          <CardDescription>
            欢迎，{session?.user.name}。本页将在 Phase 1 加入"我是谁、我的权限"模块。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            User ID: <code>{session?.user.id}</code>
          </p>
          <p className="text-sm text-muted-foreground">
            Email: <code>{session?.user.email}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [x] **Step 3: 修改 `src/app/page.tsx` 重定向到 dashboard 或 login**

```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? "/dashboard" : "/login");
}
```

- [x] **Step 4: 启动 dev 完整测一遍登录闭环**

```bash
pnpm dev
```

访问 `http://localhost:3000` → 应跳转 `/login`（未登录）。

输入应急密码 → 应跳转 `/dashboard` → 看到欢迎信息和 user 信息。

点"退出" → 应回到 `/login`。

Ctrl+C 关闭 dev。

- [x] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat: add dashboard with auth-protected layout"
```

---

## Task 18: Worker 进程占位 + cron 调度器

**Files:**
- Create: `src/worker/index.ts`, `src/worker/scheduler.ts`
- Modify: `package.json`

- [x] **Step 1: 安装 node-cron**

```bash
pnpm add node-cron
pnpm add -D @types/node-cron
```

- [x] **Step 2: 创建 `src/worker/scheduler.ts`**

```typescript
import cron from "node-cron";

export type Job = {
  name: string;
  schedule: string; // cron expression
  task: () => Promise<void>;
};

const jobs: Job[] = [];

export function registerJob(job: Job): void {
  jobs.push(job);
  console.log(`[scheduler] registered: ${job.name} (${job.schedule})`);
}

export function startScheduler(): void {
  for (const job of jobs) {
    cron.schedule(job.schedule, async () => {
      const start = Date.now();
      console.log(`[scheduler] ▶ ${job.name} starting`);
      try {
        await job.task();
        console.log(`[scheduler] ✓ ${job.name} done in ${Date.now() - start}ms`);
      } catch (err) {
        console.error(`[scheduler] ✗ ${job.name} failed:`, err);
        // notifyError(err) — Phase 1 接入
      }
    });
  }
  console.log(`[scheduler] started ${jobs.length} jobs`);
}

export function listJobs(): Job[] {
  return [...jobs];
}
```

- [x] **Step 3: 创建 `src/worker/index.ts`**

```typescript
import "@/lib/env"; // 验证 env

import { registerJob, startScheduler } from "./scheduler";

// Phase 0 占位 job：每分钟打个心跳，证明 worker 在跑
registerJob({
  name: "heartbeat",
  schedule: "* * * * *",
  task: async () => {
    console.log(`[heartbeat] ${new Date().toISOString()}`);
  },
});

// Phase 1 / 2 会在这里 register 钉钉同步、爬虫等任务

console.log("[worker] qjhy-pro worker starting");
startScheduler();

// 保持进程运行
process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received, shutting down");
  process.exit(0);
});
```

- [x] **Step 4: 在 `package.json` 加 worker script**

```json
{
  "scripts": {
    "worker": "tsx --env-file=.env.local src/worker/index.ts",
    "worker:build": "tsc -p tsconfig.worker.json"
  }
}
```

- [x] **Step 5: 短跑 worker 验证**

```bash
pnpm worker &
sleep 75  # 等 1 分多钟
kill %1
```

Expected: 看到 `[scheduler] registered: heartbeat`，1 分钟后看到 `[heartbeat] 2026-...`。

- [x] **Step 6: Commit**

```bash
git add src/worker package.json pnpm-lock.yaml
git commit -m "feat: add worker process scaffold with cron scheduler"
```

---

## Task 19: Docker Compose 加上 web + worker 容器

**Files:**
- Modify: `docker-compose.yml`
- Create: `Dockerfile.web`, `Dockerfile.worker`, `.dockerignore`

- [x] **Step 1: 创建 `.dockerignore`**

```
node_modules
.next
.git
.env.local
.env.*.local
docs
*.md
.husky
.vscode
```

- [x] **Step 2: 创建 `Dockerfile.web`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

- [x] **Step 3: 让 `next.config.ts` 输出 standalone**

修改 `next.config.ts`：

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [x] **Step 4: 创建 `Dockerfile.worker`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["pnpm", "exec", "tsx", "src/worker/index.ts"]
```

- [x] **Step 5: 修改 `docker-compose.yml` 加 web + worker**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: qjhy-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: qjhy
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-qjhy_dev_password}
      POSTGRES_DB: qjhy
    ports:
      - "5432:5432"
    volumes:
      - qjhy_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U qjhy -d qjhy"]
      interval: 5s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    container_name: qjhy-web
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://qjhy:${POSTGRES_PASSWORD:-qjhy_dev_password}@postgres:5432/qjhy
      AUTH_SECRET: ${AUTH_SECRET}
      EMERGENCY_LOGIN_PASSWORD: ${EMERGENCY_LOGIN_PASSWORD}
      DINGTALK_BOT_WEBHOOK: ${DINGTALK_BOT_WEBHOOK:-}
      DINGTALK_APP_KEY: ${DINGTALK_APP_KEY:-}
      DINGTALK_APP_SECRET: ${DINGTALK_APP_SECRET:-}
      DINGTALK_CORP_ID: ${DINGTALK_CORP_ID:-}
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
      NODE_ENV: production
    ports:
      - "3000:3000"

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    container_name: qjhy-worker
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://qjhy:${POSTGRES_PASSWORD:-qjhy_dev_password}@postgres:5432/qjhy
      AUTH_SECRET: ${AUTH_SECRET}
      EMERGENCY_LOGIN_PASSWORD: ${EMERGENCY_LOGIN_PASSWORD}
      DINGTALK_BOT_WEBHOOK: ${DINGTALK_BOT_WEBHOOK:-}
      NODE_ENV: production
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}

volumes:
  qjhy_postgres_data:
```

- [x] **Step 6: 跑一次完整 docker-compose build**

```bash
docker-compose build
```

Expected: 三个镜像 build 完成（postgres 直接 pull，web/worker 编译）。镜像构建可能较慢（5-10 分钟，首次）。

- [x] **Step 7: 启动并验证**

```bash
docker-compose --env-file=.env.local up -d
sleep 30
docker-compose ps
```

Expected: 三个服务都 `Up`。

```bash
curl -i http://localhost:3000/login
```

Expected: HTTP 200。

```bash
docker-compose logs worker --tail=10
```

Expected: 看到 `[scheduler] registered: heartbeat` 和 `[heartbeat] ...`。

- [x] **Step 8: 关闭 docker-compose**

```bash
docker-compose down
```

⚠️ 不要带 `-v`，那会清掉 postgres 数据卷！

- [x] **Step 9: Commit**

```bash
git add docker-compose.yml Dockerfile.web Dockerfile.worker .dockerignore next.config.ts
git commit -m "feat: complete Docker Compose with web + worker containers"
```

---

## Task 20: 平台数据样本探查（抖音）

> ⚠️ 此 Task 需用户配合：定位 PRO3 项目里的爬虫代码，并跑一次拉取真实样本。
> 无法跑通爬虫时，可以从 PRO3 数据库直接 dump 一条 row（含 raw JSON 字段）。

**Files:**
- Create: `docs/raw-samples/README.md`, `docs/raw-samples/douyin-session-sample.md`

- [x] **Step 1: 创建 `docs/raw-samples/README.md`**

```markdown
# 平台数据样本

存放从抖音/快手爬取的**真实原始 JSON 样本**，用于 Phase 2 数据库 schema 设计参考。

## 为什么需要样本

Phase 2 设计 `douyin_session` / `kuaishou_session` 等事实表时，必须知道：
- 平台返回了哪些字段
- 字段的实际类型和取值范围
- 哪些字段需要 extract 出来做索引（高频查询）
- 哪些字段就放在 `raw: jsonb` 里（其他都是）

**没有真实样本 = 设计 schema 全靠猜**。

## 安全

- 样本里的**主播 ID、用户名、流水金额**等敏感数据请脱敏后再 commit
- 不要把 cookie / token 留在样本里
- 文件命名 `<平台>-<数据类型>-sample.md`

## 当前样本

- `douyin-session-sample.md` - 抖音单场数据
- `kuaishou-session-sample.md` - 快手单场数据
```

- [x] **Step 2: 在 PRO3 项目找抖音爬虫输出**

```bash
# 让用户帮忙定位
ls /Users/zhangjin/miracle-pro3/server 2>/dev/null || ls /Users/zhangjin/miracle-pro3/src 2>/dev/null
grep -rl "douyin" /Users/zhangjin/miracle-pro3/src 2>/dev/null | head -5
grep -rl "douyin" /Users/zhangjin/miracle-pro3/server 2>/dev/null | head -5
```

或直接从 PRO3 的 SQLite 里 dump：

```bash
sqlite3 /Users/zhangjin/miracle-pro3/database.sqlite \
  ".tables" 2>/dev/null | head
```

找到包含抖音原始数据的表（可能命名为 `live_data` / `douyin_*` / `anchor_session`），dump 一行：

```bash
sqlite3 /Users/zhangjin/miracle-pro3/database.sqlite \
  "SELECT * FROM <table> LIMIT 1" -json | head -200
```

如果 PRO3 已经做了"翻译"，dump 出的字段会是中文/拼音——这本身就是宝贵的"反面案例"，记录到 sample 里。

- [x] **Step 3: 创建 `docs/raw-samples/douyin-session-sample.md`**

模板（用户填具体字段）：

```markdown
# 抖音单场数据样本

> 来源：PRO3 项目 `/Users/zhangjin/miracle-pro3/...`
> 采集时间：[填日期]
> 已脱敏：✅

## 来源说明

[描述爬虫如何拉的：是抓百应？抓创作者后台？接口路径是什么？]

## 字段清单（基于 N 条样本归纳）

| 字段名（平台原文） | 类型 | 含义 | 是否高频查询 | 备注 |
|---|---|---|---|---|
| session_id | string | 单场唯一ID | ✅ | 用作 unique key |
| start_time | timestamp | 开始时间 | ✅ | 索引 |
| end_time | timestamp | 结束时间 | ❌ | 在 raw 里 |
| total_diamond_count | number | 流水（钻石）| ✅ | 报表常用 |
| audience_count | number | 观看人数 | ❌ | 在 raw 里 |
| ... | ... | ... | ... | ... |

## 真实样本（脱敏后）

\`\`\`json
{
  "session_id": "DEMO_xxx",
  "start_time": "2026-04-29T20:00:00Z",
  "end_time": "2026-04-29T22:30:00Z",
  "total_diamond_count": 38520,
  "audience_count": 5234,
  "// ... 完整原始字段": "..."
}
\`\`\`

## 老中台 PRO3 的字段映射（反面案例）

PRO3 把字段翻译成了这些名字（**新中台禁止这样做**）：

| 平台原文 | PRO3 中的命名 | 评价 |
|---|---|---|
| total_diamond_count | liushui | ❌ 翻译损失字段含义 |
| audience_count | guanzhong_renshu | ❌ 拼音不规范 |
| ... | ... | ... |

新中台**直接落原文**，中文展示走 `field_alias` 配置。

## Phase 2 schema 建议

基于以上样本，`douyin_session` 表的"骨架字段"建议：

- `id` (serial PK)
- `platform_account_id` (text, FK)
- `crawled_at` (timestamp)
- `raw` (jsonb) ★
- `session_id` (text, unique, extract from raw)
- `start_time` (timestamp, indexed, extract)
- `end_time` (timestamp, extract)

其他所有字段在 `raw` 里。
```

- [x] **Step 4: 实际填入数据（用户配合）**

让用户跑爬虫或从 PRO3 dump 一条数据，填进上面的模板。**至少有 1 条真实样本就够 Phase 2 设计**。

- [x] **Step 5: Commit**

```bash
git add docs/raw-samples/README.md docs/raw-samples/douyin-session-sample.md
git commit -m "docs: add Douyin raw data sample for Phase 2 schema design"
```

---

## Task 21: 平台数据样本探查（快手）

**Files:**
- Create: `docs/raw-samples/kuaishou-session-sample.md`

- [x] **Step 1-4: 重复 Task 20 的流程，但目标平台是快手**

参考 Task 20 的模板，文件名 `docs/raw-samples/kuaishou-session-sample.md`。

字段会和抖音不同——这是预期的。每平台一张表，**不必硬性对齐**。

- [x] **Step 5: Commit**

```bash
git add docs/raw-samples/kuaishou-session-sample.md
git commit -m "docs: add Kuaishou raw data sample for Phase 2 schema design"
```

---

## Task 22: 写 README.md（项目说明 + Phase 0 验收清单）

**Files:**
- Create: `README.md`

- [x] **Step 1: 创建 `README.md`**

```markdown
# QJHY-Pro

> 新中台 · 替代 miracle-pro3 作为数据底座

[![License: Internal](https://img.shields.io/badge/license-internal-red.svg)](#)
[![Status: Phase 0](https://img.shields.io/badge/status-phase_0-blue.svg)](#)

## 项目目标

替代老中台（miracle-pro3）做"数据底座"，解决以下问题：
- 数据接口规范乱、加新功能要重新引导
- 爬虫数据被"翻译"后丢失原始字段含义
- SQLite 性能瓶颈（pro3 数据库已 600+MB）

详见 [设计文档](./docs/superpowers/specs/2026-04-30-qjhy-pro-design.md)。

## 技术栈

- Next.js 16 (App Router + RSC + Server Actions)
- TypeScript strict + Zod
- PostgreSQL 16 + Drizzle ORM
- Tailwind v4 + shadcn/ui
- better-auth（钉钉 OAuth + 应急后门）
- Docker Compose（web + worker + postgres）

## 快速开始

### 前置

- Node.js 20+（`.nvmrc`）
- pnpm 9+（`corepack enable`）
- Docker / Docker Compose

### 安装

```bash
git clone <repo>
cd qjhy-pro
pnpm install
cp .env.example .env.local
# 编辑 .env.local 填入实际值（见下）
```

### `.env.local` 必填项

- `AUTH_SECRET`：≥16 字符随机字符串（`openssl rand -base64 32`）
- `EMERGENCY_LOGIN_PASSWORD`：≥16 字符随机字符串（应急登录用）
- `DATABASE_URL`：默认本地 docker 即可
- `DINGTALK_BOT_WEBHOOK`：报错通知（可选，留空则不通知）

### 启动开发环境

```bash
docker-compose up -d postgres   # 起 Postgres
pnpm db:migrate                 # 跑 migration
pnpm dev                        # 起 Next.js（3000）

# 另一个 terminal：
pnpm worker                     # 起 Worker
```

访问 http://localhost:3000，应跳到 `/login`。用 `EMERGENCY_LOGIN_PASSWORD` 登录。

### 全栈 Docker 启动

```bash
docker-compose --env-file=.env.local up -d
```

## 开发规范

⚠️ **必读：[`CONTRIBUTING.md`](./CONTRIBUTING.md)**

简言之：
- 加新功能 = 加 `src/modules/[feature]/` 文件夹
- 模块之间只能 import `index.ts`（ESLint 强制）
- 所有 Server Action 入参 `Schema.parse()`
- 错误用 `AppError`，不用 `new Error`
- 落库不翻译字段，存原始 JSON

## Phase 0 验收清单

✅ 项目骨架就绪（Next.js 16 + TS strict + Tailwind + shadcn/ui）
✅ ESLint 跨模块限制工作（故意违规会报错）
✅ Pre-commit hook（typecheck + lint + format）+ commitlint
✅ Docker Compose 三容器（postgres + web + worker）启动成功
✅ Drizzle 迁移工作（`pnpm db:migrate`）
✅ env 通过 Zod 校验加载
✅ AppError 统一错误类型可用
✅ 钉钉机器人通知封装可用
✅ better-auth 集成 + 应急后门登录工作
✅ 钉钉 OAuth provider 占位（Phase 1 完整接入）
✅ 登录/Dashboard 闭环可走通
✅ Worker 进程 + cron 调度器可启动
✅ CONTRIBUTING.md 写完
✅ 平台数据样本（抖音/快手）已收集

## 下一步

进入 [Phase 1](./docs/superpowers/plans/) - 钉钉同步 + 权限系统。

## 项目结构

```
qjhy-pro/
├── src/
│   ├── app/          # Next.js 路由（页面/api）
│   ├── modules/      # 业务模块（feature-first）
│   ├── components/   # UI 组件（shadcn）
│   ├── db/           # Drizzle schema + migration
│   ├── lib/          # 共享工具（auth/env/errors/notify）
│   └── worker/       # Worker 进程
├── docs/
│   ├── superpowers/  # spec / plan
│   └── raw-samples/  # 平台原始数据样本
└── docker-compose.yml
```

## 相关文档

- [设计文档](./docs/superpowers/specs/2026-04-30-qjhy-pro-design.md)
- [Phase 0 实施计划](./docs/superpowers/plans/2026-04-30-phase-0-foundation.md)
- [开发规范](./CONTRIBUTING.md)
```

- [x] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with Phase 0 acceptance checklist"
```

---

## Task 23: Phase 0 端到端验收 + 创建 emergency seed 脚本

**Files:**
- Create: `src/db/seed/emergency-user.ts`
- Modify: `package.json`

- [x] **Step 1: 创建 `src/db/seed/emergency-user.ts`**

```typescript
/**
 * 一次性脚本：创建应急后门用户。
 * 只需在新部署时跑一次。
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local src/db/seed/emergency-user.ts
 */
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { auth_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";

const EMERGENCY_EMAIL = "emergency@qjhy.local";

async function main() {
  console.log("[seed] checking emergency user...");

  const [existing] = await db.select().from(auth_user).where(eq(auth_user.email, EMERGENCY_EMAIL));

  if (existing) {
    console.log("[seed] emergency user already exists:", existing.id);
    process.exit(0);
  }

  console.log("[seed] creating emergency user...");
  const result = await auth.api.signUpEmail({
    body: {
      email: EMERGENCY_EMAIL,
      password: env.EMERGENCY_LOGIN_PASSWORD,
      name: "Emergency Admin",
    },
  });

  console.log("[seed] created:", result.user?.id);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
```

- [x] **Step 2: 在 `package.json` 加 seed script**

```json
{
  "scripts": {
    "db:seed:emergency": "tsx --env-file=.env.local src/db/seed/emergency-user.ts"
  }
}
```

- [x] **Step 3: 跑一遍 seed 脚本（idempotent）**

```bash
pnpm db:seed:emergency
```

Expected: 输出"emergency user already exists"（之前 Task 16 手工创建过）。如果是干净环境，会输出 "created: xxx"。

- [x] **Step 4: Phase 0 完整端到端验收**

执行以下完整流程，所有步骤都应成功：

```bash
# 1. 干净启动
docker-compose down
docker-compose --env-file=.env.local up -d
sleep 15

# 2. Migration
pnpm db:migrate

# 3. Seed
pnpm db:seed:emergency

# 4. 验证 Web
curl -I http://localhost:3000
# Expected: 307 redirect to /login

# 5. 验证 worker 心跳（看日志）
docker-compose logs worker --tail=20
# Expected: 看到 [scheduler] registered 和 [heartbeat]

# 6. 验证 typecheck
pnpm exec tsc --noEmit
# Expected: 0 errors

# 7. 验证 lint
pnpm lint
# Expected: 0 errors, 0 warnings

# 8. 验证 format
pnpm format
# Expected: All matched files use Prettier code style

# 9. 关闭 docker
docker-compose down
```

如果任何一步失败，回到对应 task 修复后再重跑此清单。

- [x] **Step 5: 提交 seed 脚本**

```bash
git add src/db/seed package.json
git commit -m "feat: add idempotent emergency-user seed script"
```

- [x] **Step 6: 打 Phase 0 完成 tag**

```bash
git tag -a v0.1.0-phase0 -m "Phase 0 foundation complete

- Next.js 16 + TS strict + Tailwind + shadcn/ui
- ESLint cross-module restrictions enforced
- Pre-commit hooks (typecheck/lint/format) + commitlint
- Docker Compose (postgres + web + worker)
- Drizzle ORM + first migration
- Zod-validated env
- AppError unified error class
- DingTalk bot notifier (with '报错' keyword)
- better-auth + emergency backdoor login
- DingTalk OAuth provider scaffolded
- Worker process with cron scheduler
- Platform raw data samples (Douyin + Kuaishou)
"
```

- [x] **Step 7: 总结提交**

更新 `CONTRIBUTING.md` 第 8 节"已注册模块清单"——Phase 0 没有业务模块，但可以加一行说明：

```markdown
| 模块 | 路径 | 简介 | 注册时间 |
|---|---|---|---|
| _基础设施_（非业务模块）| `src/lib/*`、`src/worker/*` | env、auth、errors、notify、worker scheduler | Phase 0 (2026-04-30) |
```

```bash
git add CONTRIBUTING.md
git commit -m "docs: register Phase 0 infrastructure modules in CONTRIBUTING"
```

---

## Phase 0 完成标志

执行 Task 23 Step 4 的端到端验收清单全部通过 = Phase 0 完成。

接下来：进入 [Phase 1 plan](./2026-MM-DD-phase-1-org-permissions.md)（待 Phase 0 完成后由 writing-plans skill 生成）。

---

## 附：Self-Review 自检结果

**1. Spec 覆盖：**

| Spec 章节 | 是否在 plan 里有对应 task |
|---|---|
| 9.1 Phase 0 - Next.js 项目初始化 | ✅ Task 1 |
| 9.1 - Tailwind v4 + shadcn/ui | ✅ Task 2 |
| 9.1 - ESLint 跨模块限制 | ✅ Task 3 |
| 9.1 - Prettier | ✅ Task 4 |
| 9.1 - pre-commit hook | ✅ Task 5 |
| 9.1 - commitlint | ✅ Task 6 |
| 9.1 - Docker Compose 三容器 | ✅ Task 8, 19 |
| 9.1 - Drizzle + 第一个 migration | ✅ Task 9, 10 |
| 9.1 - CONTRIBUTING.md | ✅ Task 7 |
| 9.1 - 钉钉机器人通知（含"报错"）| ✅ Task 13 |
| 9.1 - better-auth + 钉钉 OAuth + 应急后门 | ✅ Task 14, 15, 16 |
| 9.1 - 平台数据样本探查 | ✅ Task 20, 21 |
| 4.x - env Zod 校验 | ✅ Task 11 |
| 6.x - AppError 类 | ✅ Task 12 |
| 9.1 - Dashboard 占位 | ✅ Task 17 |
| 9.1 - Worker 进程 | ✅ Task 18 |

**2. 占位符扫描：** 无 TBD/TODO 残留（所有 task 都有具体代码）。

**3. 类型一致性：**
- `AppError` 在 Task 12 定义，Task 13/14 使用 ✅
- `auth` 在 Task 14 export，Task 15/17 使用 ✅
- `env` 在 Task 11 export，所有需要的地方使用 ✅

**4. 范围检查：** Phase 0 聚焦"地基"，无业务功能溢出 ✅
