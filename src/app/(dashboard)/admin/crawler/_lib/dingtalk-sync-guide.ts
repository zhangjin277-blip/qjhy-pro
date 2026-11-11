export interface DingTalkSyncGuide {
  key: string;
  project: string;
  name: string;
  purpose: string;
  source: string;
  schedule: string;
  window: string;
  recovery: string;
  statusLabel: string;
  statusTone: "blue" | "green" | "amber";
}

/**
 * 这里展示的是同步任务的管理说明，时间与 worker 注册的 cron 对齐。
 * 只展示授权类型和运行计划，不把 App Secret、Cookie 或机器人地址送到浏览器。
 */
export const DINGTALK_SYNC_GUIDES: DingTalkSyncGuide[] = [
  {
    key: "organization",
    project: "组织管理",
    name: "钉钉人员与部门",
    purpose:
      "从钉钉通讯录同步部门和人员，更新在职状态，并刷新业务里的人员映射。离职人员保留为停用，避免历史记录失联。",
    source: "钉钉应用授权",
    schedule: "每天 02:17（北京时间）",
    window: "全量部门 + 全量人员",
    recovery: "出现失败或人数异常时，查看同步审计；确认应用权限和网络后重跑 worker 任务。",
    statusLabel: "应用授权",
    statusTone: "blue",
  },
  {
    key: "attendance-approval",
    project: "考勤与审批",
    name: "前一天考勤 + 审批",
    purpose:
      "同步前一天所有人员的上下班打卡，并同步与考勤相关的审批，用于迟到、缺卡、请假和开播安排核对。",
    source: "钉钉应用授权",
    schedule: "每天 09:00（北京时间）",
    window: "前一天；审批类型：请假、补卡、外出、加班、出差、无法开播",
    recovery: "采集结果中的考勤同步日志可核对人数、成功、失败、跳过；支持按日期手动补同步。",
    statusLabel: "应用授权",
    statusTone: "blue",
  },
  {
    key: "attendance-roster",
    project: "考勤与审批",
    name: "排班表休息日",
    purpose: "读取钉钉文档中的当月排班表，保存每天每个人的上班、休息或未配置状态，供考勤判断使用。",
    source: "钉钉文档读取授权",
    schedule: "每天 09:01（北京时间）",
    window: "当月完整排班表",
    recovery:
      "排班数据不完整时会保留上次成功数据；检查钉钉文档授权后，在考勤页面手动同步指定月份。",
    statusLabel: "文档授权",
    statusTone: "blue",
  },
  {
    key: "placement-daily",
    project: "投放业务",
    name: "投放日报",
    purpose: "读取 3 个钉钉投放群的完整日报，导入前一天的 A:T 数据，并做批次归因。",
    source: "钉钉群消息读取授权",
    schedule: "每天 11:10（北京时间）",
    window: "前一天完整日报，3 个来源",
    recovery: "重复导入幂等；日报缺失或解析失败时查看采集日志，确认群授权后再重跑。",
    statusLabel: "群消息授权",
    statusTone: "blue",
  },
  {
    key: "placement-hourly",
    project: "投放业务",
    name: "投放小时播报",
    purpose: "读取 3 个投放播报群的最新小时消息，补充实时投放数据；与日报导入分开保存。",
    source: "钉钉群消息读取授权",
    schedule: "每小时第 05 分钟",
    window: "最新小时播报，3 个来源",
    recovery: "重复消息自动跳过；可在采集结果中按时间查看失败和部分来源异常。",
    statusLabel: "群消息授权",
    statusTone: "blue",
  },
  {
    key: "recruitment-pipeline",
    project: "招聘管理",
    name: "招聘面试邀约表",
    purpose: "把钉钉招聘表中的面试邀约记录同步到招聘流程，便于跟进候选人和面试状态。",
    source: "钉钉文档读取授权",
    schedule: "手动触发（当前没有自动 cron）",
    window: "按导入时读取的表格记录",
    recovery: "在招聘管理页面执行同步；失败时检查文档授权和表格地址，不把手动同步误标为自动采集。",
    statusLabel: "手动同步",
    statusTone: "amber",
  },
];
