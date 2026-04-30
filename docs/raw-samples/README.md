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

- `douyin-session-sample.md` - 抖音单场数据（**注意：当前样本来源于 Excel 导入，非 API 原文，Phase 1 实施前需重新做 API 探查**）
- `kuaishou-session-sample.md` - 快手单场数据（**当前未找到合适样本，Phase 1 实施前必须补**）

## ⚠ 当前样本的局限性（重要）

PRO3 项目**没有抖音/快手平台 API 爬虫**——所有数据都是：

1. 抖音直播：运营从**抖音百应后台**手动导出 Excel，前端 `BatchImporter.jsx` 解析为 JSON 后落到 `business_data.content`（已是中文键名，原始 API 字段名丢失）。
2. 快手直播：**完全没有单场流水数据**，只有快币充值记录走的钉钉审批同步（同样不是平台 API）。
3. 短视频数据：同样是 Excel 导入，落到 `mcn_video_data` 表（已被列化）。

因此当前样本**只能反映 Excel 导出的字段命名**（PRO3 翻译过的中文表头），**不能反映平台 API 真实字段名**。

Phase 1 第一件事就是写真正的 API 爬虫（抖音百应/巨量/创作者后台、快手磁力开放平台），届时**用真实 API 响应替换这些样本**，再据此设计 Phase 2 的事实表 schema。
