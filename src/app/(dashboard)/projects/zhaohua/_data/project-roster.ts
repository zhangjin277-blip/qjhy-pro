export type AnchorStage = "已开播" | "培训中" | "试岗中" | "封号" | "离职";
export type AnchorType = "生态主播" | "竞价主播";

export interface EcologyAnchorRecord {
  liveName: string;
  realName: string | null;
  anchorId?: string;
  douyinId?: string;
  liveRoomUrl?: string;
  source: "线下自营" | "线上机构";
  institution: string | null;
  operator: string;
  stage: AnchorStage;
  /** 历史共享状态未填写时按生态主播兼容。 */
  anchorType?: AnchorType;
  stageNote?: string;
  liveTimeSlots?: { start: string; end: string }[];
}

export interface EcologyOperatorRecord {
  name: string;
  responsibility: string;
}

export interface EcologyRosterState {
  operators: EcologyOperatorRecord[];
  anchors: EcologyAnchorRecord[];
}

export const ECOLOGY_OPERATORS: EcologyOperatorRecord[] = [
  { name: "赵湘泉", responsibility: "跟进 5 名已开播主播、1 名试岗主播" },
  { name: "姜博涛", responsibility: "跟进 3 名已开播主播、2 名培训/试岗主播" },
  { name: "杨宁", responsibility: "跟进 5 名已开播主播" },
];

export const ECOLOGY_ANCHORS: EcologyAnchorRecord[] = [
  {
    liveName: "造化仙府-灵儿",
    realName: "张玉祺",
    anchorId: "3348450461099531",
    douyinId: "72101071546",
    source: "线下自营",
    institution: null,
    operator: "赵湘泉",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-太乙真人",
    realName: "李潇锋",
    anchorId: "3964170823285400",
    douyinId: "44074824489",
    source: "线下自营",
    institution: null,
    operator: "赵湘泉",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-大象",
    realName: "王彬旭",
    anchorId: "2134594101722810",
    douyinId: "61957496513",
    source: "线下自营",
    institution: null,
    operator: "赵湘泉",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-景天",
    realName: "钟钰康",
    anchorId: "7672956630102737957",
    douyinId: "65113422355",
    source: "线下自营",
    institution: null,
    operator: "赵湘泉",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-柚子",
    realName: "鲍郝磊",
    anchorId: "1256070470960883",
    douyinId: "36403917724",
    source: "线下自营",
    institution: null,
    operator: "赵湘泉",
    stage: "已开播",
  },
  {
    liveName: "待定",
    realName: "段江锋",
    source: "线下自营",
    institution: null,
    operator: "赵湘泉",
    stage: "试岗中",
    stageNote: "试岗第 1 天",
  },
  {
    liveName: "造化仙府-天天祖师",
    realName: "刘远平",
    anchorId: "533700693983936",
    douyinId: "93147301490",
    source: "线下自营",
    institution: null,
    operator: "姜博涛",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-申公豹",
    realName: "刘高磊",
    anchorId: "4245645800767867",
    douyinId: "97244615888",
    source: "线下自营",
    institution: null,
    operator: "姜博涛",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-说书人",
    realName: "杨李振邦",
    anchorId: "428152490561977",
    douyinId: "29320294881",
    source: "线下自营",
    institution: null,
    operator: "姜博涛",
    stage: "已开播",
  },
  {
    liveName: "待定",
    realName: "黄璇",
    source: "线下自营",
    institution: null,
    operator: "姜博涛",
    stage: "培训中",
  },
  {
    liveName: "待定",
    realName: "胡卉",
    source: "线下自营",
    institution: null,
    operator: "姜博涛",
    stage: "试岗中",
    stageNote: "试岗第 1 天",
  },
  {
    liveName: "造化仙府-白衣",
    realName: "宋可廷",
    anchorId: "93896736521671",
    douyinId: "30504943478",
    source: "线下自营",
    institution: null,
    operator: "杨宁",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-杜康",
    realName: "吴思君",
    anchorId: "105235485659",
    douyinId: "814701512k",
    liveRoomUrl: "https://live.douyin.com/844388807672",
    source: "线下自营",
    institution: null,
    operator: "杨宁",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-稚哄",
    realName: "全晓勇",
    anchorId: "532612905446287",
    douyinId: "31869285722",
    source: "线下自营",
    institution: null,
    operator: "杨宁",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-亭亭亭",
    realName: "赵芳婷",
    anchorId: "855848295871276",
    douyinId: "74370013870",
    source: "线下自营",
    institution: null,
    operator: "杨宁",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-莓莓",
    realName: "肖澳",
    anchorId: "2123907777167374",
    douyinId: "meidai86336",
    source: "线下自营",
    institution: null,
    operator: "杨宁",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-仙仙",
    realName: null,
    source: "线上机构",
    institution: "桃桃乐",
    operator: "丁友发",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-南波万",
    realName: null,
    source: "线上机构",
    institution: "桃桃乐",
    operator: "丁友发",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-小宋",
    realName: null,
    anchorId: "67109969157",
    douyinId: "s000828",
    source: "线上机构",
    institution: "桃桃乐",
    operator: "丁友发",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-梵天",
    realName: null,
    source: "线上机构",
    institution: "掀桌子",
    operator: "丁友发",
    stage: "已开播",
  },
  {
    liveName: "造化仙府-封神",
    realName: null,
    source: "线上机构",
    institution: "掀桌子",
    operator: "丁友发",
    stage: "已开播",
  },
];

export const INITIAL_ECOLOGY_ROSTER: EcologyRosterState = {
  operators: ECOLOGY_OPERATORS,
  anchors: ECOLOGY_ANCHORS,
};

export type OfficialStaffStage = "在岗" | "在播" | "培训中" | "离职";

export interface OfficialStaffRecord {
  name: string;
  alias: string | null;
  role: "运营" | "运营（实习生）" | "场控" | "主播";
  stage: OfficialStaffStage;
  responsibility: string;
}

export type OfficialShiftRole = "主播" | "场控" | "运营";

export interface OfficialShiftAssignment {
  name: string;
  role: OfficialShiftRole;
  responsibility: string;
  startTime: string;
  endTime: string;
}

export interface OfficialRotationShift {
  id: string;
  date: string;
  name: string;
  assignments: OfficialShiftAssignment[];
  note?: string;
  status: "待确认" | "已排班";
}

export const OFFICIAL_STAFF: OfficialStaffRecord[] = [
  {
    name: "肖杰阳",
    alias: null,
    role: "运营",
    stage: "在岗",
    responsibility: "整体统筹、直播内容更新及把控、主播培训考核、跟播复盘",
  },
  {
    name: "舒畅",
    alias: null,
    role: "运营",
    stage: "在岗",
    responsibility: "主播培训、跟播复盘、直播台本更新",
  },
  {
    name: "生若楠",
    alias: null,
    role: "运营（实习生）",
    stage: "在岗",
    responsibility: "培训监督、设计需求对接、直播间内容拆解",
  },
  {
    name: "钟楚潜",
    alias: null,
    role: "场控",
    stage: "在岗",
    responsibility: "设备调整确认、直播流程控场、直播间氛围维护",
  },
  {
    name: "薛媚",
    alias: null,
    role: "场控",
    stage: "在岗",
    responsibility: "设备调整确认、直播流程控场、直播间氛围维护",
  },
  {
    name: "姜艳琪",
    alias: "小Q",
    role: "主播",
    stage: "在播",
    responsibility: "大屏女主播",
  },
  {
    name: "欧阳丽欣",
    alias: "小羊",
    role: "主播",
    stage: "在播",
    responsibility: "大屏女主播",
  },
  {
    name: "蒋鑫怡",
    alias: "椰子",
    role: "主播",
    stage: "在播",
    responsibility: "大屏女主播",
  },
  {
    name: "朱俊露",
    alias: "小元",
    role: "主播",
    stage: "在播",
    responsibility: "大屏女主播",
  },
  {
    name: "侯涵宇",
    alias: "小于",
    role: "主播",
    stage: "在播",
    responsibility: "大屏男主播",
  },
  {
    name: "王小坤",
    alias: "king",
    role: "主播",
    stage: "在播",
    responsibility: "大屏男主播",
  },
  {
    name: "陆月",
    alias: null,
    role: "主播",
    stage: "培训中",
    responsibility: "大屏培训女主播",
  },
  {
    name: "肖旭",
    alias: null,
    role: "主播",
    stage: "培训中",
    responsibility: "大屏培训女主播",
  },
  {
    name: "刘芳芹",
    alias: null,
    role: "主播",
    stage: "培训中",
    responsibility: "大屏培训女主播",
  },
  {
    name: "余世兴",
    alias: null,
    role: "主播",
    stage: "培训中",
    responsibility: "大屏培训男主播",
  },
];

// Actual shift times and assignments have not been supplied yet.
export const OFFICIAL_ROTATION_SHIFTS: OfficialRotationShift[] = [];

export const COLLABORATION_ROLES = [
  {
    name: "丁友发",
    organization: "长沙团队",
    role: "生态主播负责人",
    responsibility: "线下主播孵化与运营，兼管线上机构",
  },
  {
    name: "黄建良",
    organization: "长沙团队",
    role: "管理沟通",
    responsibility: "与恒星负责人沟通并承接项目要求",
  },
  {
    name: "杨钢",
    organization: "深圳恒星",
    role: "项目运营对接",
    responsibility: "恒星侧项目运营协作",
  },
  {
    name: "傅晓烽",
    organization: "深圳恒星",
    role: "投放对接",
    responsibility: "恒星侧项目投放协作",
  },
  {
    name: "杨晨",
    organization: "深圳恒星",
    role: "恒星负责人",
    responsibility: "管理层项目沟通与要求确认",
  },
] as const;

export const OFFICIAL_PLATFORMS = [
  {
    platform: "抖音",
    status: "运营中",
    account: "1 个官号",
    note: "官号名称与 UID 待补充",
  },
  {
    platform: "视频号",
    status: "筹备中",
    account: "电脑推流",
    note: "复用抖音现有运营、场控与主播班组",
  },
] as const;
