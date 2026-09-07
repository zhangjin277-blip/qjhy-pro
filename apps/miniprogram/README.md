# QJHY Pro Mini Program

## Local development

Configure the same DingTalk user ID for both processes. The development header is accepted only when the Next.js server is not running in production mode.

```bash
# Terminal 1: Next.js API
MINIPROGRAM_DEV_USER_ID=<dingtalk_user_id> pnpm dev -- -p 8443

# Terminal 2: WeChat build watcher
MINIPROGRAM_DEV_USER_ID=<dingtalk_user_id> pnpm mini:dev
```

Open `apps/miniprogram` in WeChat DevTools. The generated mini program root is `dist/`.

The local API defaults to `http://127.0.0.1:8443`. Override it when testing against another machine:

```bash
MINI_PROGRAM_API_BASE_URL=http://192.168.1.10:8443 pnpm mini:dev
```

`project.config.json` uses `touristappid` for the initial local preview. Replace it with the real mini program AppID before implementing `wx.login` and device testing.
