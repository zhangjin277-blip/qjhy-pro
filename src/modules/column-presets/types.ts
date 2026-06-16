/** platform: 抖音 douyin / 快手 kuaishou */
export type PresetPlatform = "douyin" | "kuaishou";

/** 经纪人筛选快照（抖音运营/招募经纪人多选名字列表）；null = 预设不带筛选 */
export interface BrokerFilterSnapshot {
  operate: string[];
  recruit: string[];
}

export interface UserColumnPreset {
  id: number;
  platform: PresetPlatform;
  name: string;
  columns: string[];
  /** 抖音 'all'|'ddz'|'three'；快手为 product 名（"全部"/"捕鱼大作战"/...） */
  project: string;
  /** 经纪人筛选快照（仅抖音用）；null = 不带筛选 */
  brokerFilter: BrokerFilterSnapshot | null;
  created_at: string;
  updated_at: string;
}
