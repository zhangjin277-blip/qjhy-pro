import { z } from "zod";

const PlatformEnum = z.enum(["douyin", "kuaishou"]);
// project 字段：抖音 'all'|'ddz'|'three'；快手 product 字符串（"全部"/"捕鱼大作战"/...）
const ProjectField = z.string().min(1).max(40);
// 经纪人筛选快照：{operate, recruit} 名字列表，或 null（不带筛选）
const BrokerFilterField = z
  .object({
    operate: z.array(z.string()).max(200),
    recruit: z.array(z.string()).max(200),
  })
  .nullable();

export const SavePresetSchema = z.object({
  platform: PlatformEnum.default("douyin"),
  name: z.string().min(1).max(40),
  columns: z.array(z.string().min(1)).min(1).max(200),
  project: ProjectField.default("all"),
  brokerFilter: BrokerFilterField.optional(),
});
export type SavePresetInput = z.infer<typeof SavePresetSchema>;

export const UpdatePresetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(40).optional(),
  columns: z.array(z.string().min(1)).min(1).max(200).optional(),
  project: ProjectField.optional(),
  brokerFilter: BrokerFilterField.optional(),
});
export type UpdatePresetInput = z.infer<typeof UpdatePresetSchema>;
