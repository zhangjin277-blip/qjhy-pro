export const COOKIE_GROUPS = [
  {
    key: "live",
    label: "直播采集",
    description: "直播账号、成员和历史场次",
    keys: ["cs", "nc1", "nc2", "kuaishou"],
  },
  {
    key: "ai-comic",
    label: "AI 漫剧",
    description: "各平台创作者中心",
    keys: [
      "kuaishou_creator",
      "douyin_creator",
      "douyin_creator_xiao_mowan",
      "wechat_creator",
      "bilibili_creator",
      "xiaohongshu_creator",
    ],
  },
  { key: "official", label: "官号内容", description: "官号灵机与内容复盘", keys: ["lingji"] },
];
