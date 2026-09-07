import { defineConfig, type UserConfigExport } from "@tarojs/cli";

const config: UserConfigExport = {
  projectName: "qjhy-pro-miniprogram",
  date: "2026-08-11",
  designWidth: 750,
  deviceRatio: {
    375: 2,
    750: 1,
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  cache: { enable: true },
  plugins: ["@tarojs/plugin-framework-react"],
  defineConstants: {
    MINI_PROGRAM_API_BASE_URL: JSON.stringify(
      process.env.MINI_PROGRAM_API_BASE_URL ?? "http://127.0.0.1:8443",
    ),
    MINI_PROGRAM_DEV_USER_ID: JSON.stringify(process.env.MINIPROGRAM_DEV_USER_ID ?? ""),
  },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false },
    },
  },
};

export default defineConfig(config);
