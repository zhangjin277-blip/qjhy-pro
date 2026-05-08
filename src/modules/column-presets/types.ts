/** platform: 抖音 douyin / 快手 kuaishou */
export type PresetPlatform = "douyin" | "kuaishou";

export interface UserColumnPreset {
  id: number;
  platform: PresetPlatform;
  name: string;
  columns: string[];
  /** 抖音 'all'|'ddz'|'three'；快手为 product 名（"全部"/"捕鱼大作战"/...） */
  project: string;
  created_at: string;
  updated_at: string;
}
