# QJHY-Pro Design Tokens V1.0

> 来源：基于真实百应（抖音公会管理后台）UI 截图分析 + 字节 Semi Design 体系。
> 适用：所有 QJHY-Pro 前端页面，覆盖 shadcn/ui 默认。
> 版本：V1.0 · 2026-04-30

---

## 0. 设计哲学

| 原则 | 说明 |
|---|---|
| **干净专业** | 大量留白 + 极轻阴影 + 细边框，不花哨 |
| **高信息密度** | 紧凑卡片 + 表格驱动，B 端管理后台美学 |
| **数据中心** | 关键数字字号大、字重粗，副标题克制 |
| **状态分明** | 涨跌用色遵循中国金融习惯：**涨红跌绿** |
| **品牌克制** | 主色一种蓝，强调色一抹，避免色彩污染 |

---

## 1. 三层 Token 架构

```
Primitive (具体色值/数值，永远不直接用在组件)
    ↓
Semantic (按用途命名，组件层引用)
    ↓
Component (按组件命名，可微调)
```

---

## 2. Primitive Tokens（原始值，不直接用）

### 2.1 蓝色 - 主色 scale（字节蓝）

| Token | Hex | 用途 |
|---|---|---|
| `--color-blue-50` | `#EBF1FF` | 极浅，hover 背景、tag 背景 |
| `--color-blue-100` | `#D6E4FF` | 浅，表单 focus ring |
| `--color-blue-200` | `#ADC8FF` | |
| `--color-blue-300` | `#85ADFF` | |
| `--color-blue-400` | `#5C8AFF` | sparkline 图表 |
| `--color-blue-500` | `#4080FF` | hover 状态 |
| `--color-blue-600` | `#2B5CFF` | **★ 主色 default** |
| `--color-blue-700` | `#1947FA` | active / pressed |
| `--color-blue-800` | `#0E32CC` | 强调标题色 |
| `--color-blue-900` | `#0A2399` | |
| `--color-blue-950` | `#061A66` | |

### 2.2 灰色 - 中性 scale（11 级）

| Token | Hex | 用途 |
|---|---|---|
| `--color-gray-0` | `#FFFFFF` | 纯白，卡片 / 主背景 |
| `--color-gray-50` | `#F7F8FA` | 极浅灰，整页背景 |
| `--color-gray-100` | `#F2F3F5` | 卡片悬浮的底色 |
| `--color-gray-200` | `#E5E6EB` | 边框 default |
| `--color-gray-300` | `#C9CDD4` | disabled 边框 |
| `--color-gray-400` | `#86909C` | 次要文字、icon |
| `--color-gray-500` | `#6B7785` | placeholder |
| `--color-gray-600` | `#4E5969` | 正文次要 |
| `--color-gray-700` | `#272E3B` | 正文主要 |
| `--color-gray-800` | `#1D2129` | **★ 标题/大数字默认色** |
| `--color-gray-900` | `#0F1419` | 极强调（基本不用）|

### 2.3 状态色 scale

| 状态 | Hex 主色 | 浅色背景 | 用途 |
|---|---|---|---|
| Success | `#00B42A` | `#E8FFEA` | 成功状态、绿色（**注意：不用于"上涨"**）|
| Warning | `#FF7D00` | `#FFF7E8` | 警告横条、风险提示 |
| Error | `#F53F3F` | `#FFECE8` | 错误、删除、危险操作 |
| Info | `#2B5CFF` | `#EBF1FF` | 信息提示（同主色）|

### 2.4 涨跌专用色（中国 B 端约定：涨红跌绿）

| 含义 | Hex | 用途 |
|---|---|---|
| `--color-change-up` | `#F53F3F` | "+16%" 涨幅红色 |
| `--color-change-down` | `#00B42A` | "-23%" 跌幅绿色 |
| `--color-change-flat` | `#86909C` | 持平灰色 |

> ⚠️ 这与国际标准（涨绿跌红）相反。**只用于涨跌指标**，不用于其他 success/error 语义。

### 2.5 侧栏/抖音品牌色（极少用）

| Token | Hex | 用途 |
|---|---|---|
| `--color-sidebar-bg` | `#F2F6FE` | 侧栏背景（极浅蓝灰）|
| `--color-douyin-red` | `#FE2C55` | 抖音 logo 时使用，**不用于一般 UI**|

---

## 3. Semantic Tokens（按用途命名，组件层只引用这一层）

### 3.1 表面色

```css
--background:           var(--color-gray-50);       /* 整页背景 */
--surface:              var(--color-gray-0);        /* 卡片背景 */
--surface-hover:        var(--color-gray-100);      /* 卡片 hover */
--surface-sunken:       var(--color-gray-100);      /* 表格表头等"凹陷"区 */
--sidebar:              var(--color-sidebar-bg);    /* 侧栏 */
--overlay:              rgba(15, 20, 25, 0.5);      /* 遮罩 */
```

### 3.2 文字色

```css
--text-primary:         var(--color-gray-800);      /* 标题 / 大数字 */
--text-body:            var(--color-gray-700);      /* 正文 */
--text-secondary:       var(--color-gray-600);      /* 副标题 */
--text-muted:           var(--color-gray-400);      /* 提示文字 */
--text-disabled:        var(--color-gray-300);      /* 禁用 */
--text-on-primary:      var(--color-gray-0);        /* 主色按钮上的字 */
--text-link:            var(--color-blue-600);      /* 链接 */
```

### 3.3 边框色

```css
--border-default:       var(--color-gray-200);      /* 卡片/输入框边框 */
--border-strong:        var(--color-gray-300);      /* hover/focus 加深 */
--border-divider:       var(--color-gray-100);      /* 分割线（更浅）*/
--border-focus:         var(--color-blue-600);      /* focus ring */
```

### 3.4 主色和强调

```css
--primary:              var(--color-blue-600);
--primary-hover:        var(--color-blue-500);
--primary-active:       var(--color-blue-700);
--primary-bg:           var(--color-blue-50);       /* 浅蓝背景（tag/选中态）*/
--primary-foreground:   var(--color-gray-0);
```

### 3.5 状态语义

```css
--success:              var(--color-success-500, #00B42A);
--success-bg:           #E8FFEA;
--warning:              var(--color-warning-500, #FF7D00);
--warning-bg:           #FFF7E8;
--danger:               var(--color-danger-500, #F53F3F);
--danger-bg:            #FFECE8;
--info:                 var(--color-blue-600);
--info-bg:              var(--color-blue-50);
```

### 3.6 涨跌专用语义

```css
--change-up:            var(--color-change-up);     /* 红 */
--change-down:          var(--color-change-down);   /* 绿 */
--change-flat:          var(--color-change-flat);   /* 灰 */
```

---

## 4. Typography

### 4.1 字体栈

```css
--font-sans:
  "PingFang SC",
  "HarmonyOS Sans SC",
  "Microsoft YaHei",
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  system-ui,
  sans-serif;

--font-mono:
  "JetBrains Mono",
  "SF Mono",
  Monaco,
  Consolas,
  "Courier New",
  monospace;

--font-numeric:  /* 大数字时用 */
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  system-ui,
  sans-serif;
```

### 4.2 字号 scale

| Token | px | 用途 |
|---|---|---|
| `--text-xs` | 12px | 辅助说明、tag 文字 |
| `--text-sm` | 13px | B 端密集表格 |
| `--text-base` | 14px | **★ 默认正文** |
| `--text-md` | 15px | 偏大正文 |
| `--text-lg` | 16px | 副标题 |
| `--text-xl` | 18px | 卡片标题 |
| `--text-2xl` | 20px | 页面 H2 |
| `--text-3xl` | 24px | 页面 H1 |
| `--text-4xl` | 28px | 数据卡片小数字 |
| `--text-5xl` | 32px | **★ 数据卡片大数字** |
| `--text-6xl` | 40px | KPI 大屏 |

### 4.3 行高

| Token | 值 |
|---|---|
| `--leading-none` | 1 |
| `--leading-tight` | 1.25 |
| `--leading-snug` | 1.375 |
| `--leading-normal` | 1.5 |
| `--leading-relaxed` | 1.625 |
| `--leading-loose` | 2 |

### 4.4 字重

| Token | 值 | 用途 |
|---|---|---|
| `--font-weight-normal` | 400 | 正文 |
| `--font-weight-medium` | 500 | 副标题、tab 选中 |
| `--font-weight-semibold` | 600 | 标题 |
| `--font-weight-bold` | 700 | 数据卡片大数字 |

---

## 5. Spacing（基于 4px 网格）

```css
--space-0:    0;
--space-px:   1px;
--space-0_5:  2px;
--space-1:    4px;
--space-1_5:  6px;
--space-2:    8px;
--space-3:    12px;
--space-4:    16px;     /* ★ 卡片 padding 默认 */
--space-5:    20px;
--space-6:    24px;     /* ★ 卡片之间间距 */
--space-8:    32px;
--space-10:   40px;
--space-12:   48px;
--space-16:   64px;
--space-20:   80px;
--space-24:   96px;
```

---

## 6. Radius

```css
--radius-none:  0;
--radius-sm:    4px;
--radius-md:    6px;     /* 输入框、按钮默认 */
--radius-lg:    8px;     /* ★ 卡片默认 */
--radius-xl:    12px;    /* 大卡片 */
--radius-2xl:   16px;
--radius-full:  9999px;
```

---

## 7. Shadow（极克制，B 端美学不用大阴影）

```css
--shadow-none:  none;
--shadow-xs:    0 1px 2px 0 rgba(15, 20, 25, 0.04);
--shadow-sm:    0 2px 4px 0 rgba(15, 20, 25, 0.05);
--shadow-md:    0 4px 12px 0 rgba(15, 20, 25, 0.06);   /* ★ 卡片 hover */
--shadow-lg:    0 8px 24px 0 rgba(15, 20, 25, 0.08);   /* dropdown */
--shadow-xl:    0 16px 32px 0 rgba(15, 20, 25, 0.10);  /* dialog */

/* focus ring */
--ring-offset:  2px;
--ring-color:   var(--color-blue-100);
--ring-width:   3px;
```

---

## 8. Border

```css
--border-width-1:  1px;
--border-width-2:  2px;
```

---

## 9. Transition

```css
--duration-fast:    100ms;
--duration-base:    200ms;     /* ★ 默认 */
--duration-slow:    300ms;
--easing-linear:    linear;
--easing-in:        cubic-bezier(0.4, 0, 1, 1);
--easing-out:       cubic-bezier(0, 0, 0.2, 1);     /* ★ 默认 */
--easing-in-out:    cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 10. Component Token 用法约定

### 10.1 Button

| Variant | bg | text | border | hover bg |
|---|---|---|---|---|
| **primary** | `--primary` | `--primary-foreground` | none | `--primary-hover` |
| **secondary** | `--surface` | `--text-body` | `--border-default` | `--surface-hover` |
| **outline** | transparent | `--primary` | `--primary` | `--primary-bg` |
| **ghost** | transparent | `--text-body` | none | `--surface-hover` |
| **destructive** | `--danger` | white | none | `#D93026` |
| **link** | transparent | `--text-link` | none | underline |

**默认尺寸：** padding `8px 16px`、`text-base`、`radius-md`、`font-weight-medium`。

### 10.2 Card

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border-divider);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  /* shadow 默认 none，hover 时才加 shadow-md */
}
```

### 10.3 Input

```css
.input {
  background: var(--surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 var(--space-3);
  height: 32px;          /* 中等 */
  font-size: var(--text-base);
  color: var(--text-body);
}
.input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 var(--ring-width) var(--ring-color);
}
```

### 10.4 Table

| 部分 | token |
|---|---|
| 表头 bg | `--surface-sunken` |
| 表头 text | `--text-secondary` + `--font-weight-medium` |
| 行 bg | `--surface` |
| 行 hover | `--surface-hover` |
| 行分割线 | `--border-divider` |
| 单元格 padding | `12px 16px`（密集模式 `8px 12px`）|

### 10.5 数据卡片（KPI）

```html
<div class="kpi-card">
  <p class="kpi-label">音浪</p>      <!-- text-sm + text-muted -->
  <p class="kpi-value">12.34万</p>    <!-- text-5xl + font-bold + text-primary -->
  <p class="kpi-change">             <!-- text-sm -->
    昨日同期 10.59万
    <span class="change-up">+16% ▲</span>  <!-- color: var(--change-up) -->
  </p>
</div>
```

### 10.6 Sidebar 菜单项

| 状态 | bg | text | indicator |
|---|---|---|---|
| default | transparent | `--text-body` | none |
| hover | `--primary-bg` | `--primary` | none |
| active（当前页）| `--primary-bg` | `--primary` | 左 3px 蓝条 |

---

## 11. 应用方式（写进 `src/app/globals.css`）

执行 Phase 0 Task 2 时，把 shadcn 自动生成的 `globals.css` 替换为如下结构：

```css
@import "tailwindcss";

/* ========== Primitives ========== */
@theme {
  /* 蓝色 scale */
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

  /* 灰色 scale */
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

  /* 字体 */
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

  /* 自定义业务语义 */
  --sidebar: #F2F6FE;
  --change-up: #F53F3F;
  --change-down: #00B42A;
  --change-flat: var(--color-gray-400);
}

/* ========== Semantic (dark) ========== */
/* 暗色模式占位，MVP 不强制实现，但 token 留好 */
.dark {
  --background: #0F1419;
  --foreground: var(--color-gray-50);
  --card: #1A1F26;
  --card-foreground: var(--color-gray-50);
  --primary: var(--color-blue-500);
  --primary-foreground: var(--color-gray-50);
  --border: #2A3140;
  --sidebar: #161B23;
  /* ... 其他 token 在 dark 下需要的反转，Phase 3 完善 */
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

/* 数字字号工具类（中台数据卡常用）*/
.kpi-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}

/* 涨跌色工具类 */
.change-up   { color: var(--change-up); }
.change-down { color: var(--change-down); }
.change-flat { color: var(--change-flat); }
```

---

## 12. 关键决策记录

| 决策 | 理由 |
|---|---|
| 用字节蓝（#2B5CFF）而非通用 Material Blue | 风格参考百应/Semi Design，字节蓝偏冷偏深 |
| 涨红跌绿（不是涨绿跌红）| 中国 B 端金融习惯，百应/雪球/财经类全是这个用法 |
| 卡片默认无阴影，hover 才加 | B 端美学，避免页面"过载" |
| 主背景用 #F7F8FA 而非纯白 | 卡片之间有"层次感"，比纯白专业 |
| 字号默认 14px（不是 16px）| B 端高信息密度，参考字节内部产品 |
| 中文字体优先 PingFang SC | 装在 macOS 默认有，Win 用 YaHei fallback |
| 暗色模式留 token 但 MVP 不实现 | 投入产出比低，Phase 3 再说 |

---

## 13. 验收清单（Phase 0 Task 2 完成时）

- [ ] `src/app/globals.css` 已替换为本文档第 11 节的内容
- [ ] 首页 `<Button>` 在 light 模式下是字节蓝色
- [ ] 卡片背景白色，整页背景浅灰 `#F7F8FA`
- [ ] 字号默认 14px
- [ ] 中文字体已优先 PingFang SC（macOS 上看效果）
- [ ] 浏览器开发者工具能看到 CSS variables（如 `--primary` 等）
- [ ] 涨跌指标演示组件用对了 `change-up` / `change-down` 颜色
