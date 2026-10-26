/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/modules/attendance/pro3/ui/**/*.{js,jsx}', './src/app/(dashboard)/attendance/attendance-client.tsx'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // 旧别名（保留兼容）
        'brand-blue': '#1677ff',

        // Semantic — 引用 CSS 变量，与 src/styles/tokens/semantic.css 对齐
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover:   'var(--color-primary-hover)',
          active:  'var(--color-primary-active)',
          subtle:  'var(--color-primary-subtle)',
          strong:  'var(--color-primary-strong)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          subtle:  'var(--color-success-subtle)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          subtle:  'var(--color-warning-subtle)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover:   'var(--color-danger-hover)',
          active:  'var(--color-danger-active)',
          subtle:  'var(--color-danger-subtle)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          subtle:  'var(--color-info-subtle)',
        },
        accent: 'var(--color-accent)',

        // 语义背景 / 文本 / 边框（命名空间避免与 Tailwind 内置冲突）
        surface: {
          page:     'var(--color-bg-page)',
          card:     'var(--color-bg-card)',
          elevated: 'var(--color-bg-elevated)',
          hover:    'var(--color-bg-hover)',
          muted:    'var(--color-bg-muted)',
          inverse:  'var(--color-bg-inverse)',
        },
        ink: {
          primary:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted:     'var(--color-text-muted)',
          disabled:  'var(--color-text-disabled)',
          inverse:   'var(--color-text-inverse)',
          link:      'var(--color-text-link)',
        },
        line: {
          DEFAULT: 'var(--color-border)',
          subtle:  'var(--color-border-subtle)',
          strong:  'var(--color-border-strong)',
        },
      },
      borderRadius: {
        'ios':    'var(--radius-ios)',
        'button': 'var(--radius-button)',
        'card':   'var(--radius-card)',
        'modal':  'var(--radius-modal)',
        'pill':   'var(--radius-pill)',
      },
      boxShadow: {
        'token-xs':    'var(--shadow-xs)',
        'token-sm':    'var(--shadow-sm)',
        'token-md':    'var(--shadow-md)',
        'token-lg':    'var(--shadow-lg)',
        'token-card':  'var(--shadow-card)',
        'token-hover': 'var(--shadow-card-hover)',
        'token-modal': 'var(--shadow-modal)',
        'token-focus': 'var(--shadow-focus)',
      },
      fontSize: {
        // 细粒度极小字号（取代散布的 text-[9/10/11px]）
        '3xs':        'var(--font-size-3xs)',   // 9px
        '2xs':        'var(--font-size-2xs)',   // 10px
        'xs-plus':    'var(--font-size-xs-plus)', // 11px
        'token-xs':   'var(--font-size-xs)',
        'token-sm':   'var(--font-size-sm)',
        'token-base': 'var(--font-size-base)',
        'token-lg':   'var(--font-size-lg)',
        'token-xl':   'var(--font-size-xl)',
        'token-2xl':  'var(--font-size-2xl)',
        'token-3xl':  'var(--font-size-3xl)',
      },
      backgroundImage: {
        // 品牌渐变（配合 HeroIconBlock / Avatar / 装饰卡片）
        'gradient-brand-primary': 'var(--gradient-brand-primary)',
        'gradient-brand-indigo':  'var(--gradient-brand-indigo)',
        'gradient-brand-purple':  'var(--gradient-brand-purple)',
        'gradient-brand-success': 'var(--gradient-brand-success)',
        'gradient-brand-warning': 'var(--gradient-brand-warning)',
        'gradient-brand-danger':  'var(--gradient-brand-danger)',
        'gradient-brand-cyan':    'var(--gradient-brand-cyan)',
        'gradient-brand-amber':   'var(--gradient-brand-amber)',
        'gradient-brand-rose':    'var(--gradient-brand-rose)',
        'gradient-brand-gold':    'var(--gradient-brand-gold)',
        'gradient-brand-slate':   'var(--gradient-brand-slate)',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in':  'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
