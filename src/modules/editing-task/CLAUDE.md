# editing-task 模块（剪辑工作流）

> 读本目录文件时自动加载。只写代码看不出来的口径和坑。

## 状态机（5 态）

pending(待上传) → uploaded(待剪辑) → editing(剪辑中) → review(审核) → published(已发布)。
事件全记 `editing_task_event`。软删（deleted_at），不物理删。

## ⚠️ anchor_id 的坑（最容易踩）

`editing_task.anchor_id` 存的是**钉钉 user_id**（FK 已 drop），**不是** anchor_profile.anchor_id（平台主播 UID）。
- 不能 join anchor_profile 拿主播档案
- scope.ts 里 `eq(editing_task.anchor_id, userId)` 直接和钉钉 userId 比较是对的
- 要拿账号→主播档案链：`live_account.platform_uid = anchor_profile.anchor_id`（注意不是 platform_account_id，那是抖音号/快手号，档案存的是 UID）

## 关键口径

- **剪辑师产出/完成数**：按「交片日」算 = `edited_uploaded_at`（上传成品时刻），不是任务创建日或素材日
- **剪辑师识别**：按「后期」部门（dingtalk_user.dept_ids 含后期部门）
- **捕鱼覆盖度**：基于开播记录（live_session_log），每开播 1 天应传 1 条素材；排除不合格任务（disqualified 视为未完成）；只算部门含「主播」的真主播
- **甘特「产品占比」**：交片日所在月份 × live_account.product；**斗地主按账号运营(agent_dingtalk_user_id→部门别名 线上运营/线下运营)拆「线上·/线下·/其他·途游斗地主」**——账号没填运营就落「其他」，去直播账号页补运营即自动归位
- **判重**：只按素材 MD5（source_file_hashes），没有任务级判重

## 文件命名（NAS 上）

- 捕鱼系：`YYYYMMDD-直播间-主播-NN`（直播间缺失时降级 `YYYYMMDD-主播-NN`）+ 产品段；强制选主播
- NAS 路径按产品分目录：`{产品}-新/`（如 捕鱼大作战-新/）；素材 source/ 成品 edited/ 封面 cover/
- 路径序号有过撞车覆盖事故，现在用 DB 计数器防撞（见 9ee717e）

## 上传（大文件）

流式：busboy 边收边写 NAS 临时文件+算 md5（editing-storage/upload-stream.ts），action 只收 {taskId, fileName, md5, tmpRelPath}，**不能**把文件读进内存（曾 1.6GB OOM）。API route `maxDuration=600`。

## 通知

紧急任务创建/交片 → 钉钉加急（EDITING_DINGTALK_WEBHOOK）。主播扣分 cron 基于开播记录。
