/** 实际发送链路；不向浏览器暴露机器人地址。 */
export const NOTIFICATION_MODULES = [
  {
    module_key: "crawler_error",
    module_name: "采集异常",
    description: "任务失败、数据未就绪提醒",
    webhook: "DINGTALK_BOT_WEBHOOK",
  },
  {
    module_key: "cookie_expired",
    module_name: "Cookie 失效",
    description: "登录态过期时通知更新",
    webhook: "COOKIE_ALERT_DINGTALK_WEBHOOK",
  },
  {
    module_key: "live_checkin",
    module_name: "直播打卡",
    description: "上播、下播通知",
    webhook: "DINGTALK_BOT_WEBHOOK",
  },
  {
    module_key: "placement_alert",
    module_name: "投放日报",
    description: "整点导入预警",
    webhook: "PLACEMENT_ALERT_DINGTALK_WEBHOOK",
  },
  {
    module_key: "procurement",
    module_name: "采购审批",
    description: "采购申请和状态流转提醒",
    webhook: "PROCUREMENT_DINGTALK_WEBHOOK",
    fallback: "DINGTALK_BOT_WEBHOOK",
  },
  {
    module_key: "editing_urgent",
    module_name: "剪辑加急",
    description: "加急任务创建和成片上传提醒",
    webhook: "EDITING_DINGTALK_WEBHOOK",
    fallback: "DINGTALK_BOT_WEBHOOK",
  },
] as const;
