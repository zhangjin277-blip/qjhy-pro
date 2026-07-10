import { z } from "zod";

export const AddStreamerInput = z.object({
  /** 直播间链接或房间号;可带 ",主播:名字" 后缀,原样透传给引擎 */
  url: z.string().trim().min(1, "直播间链接不能为空").max(500),
});

export const ControlStreamerInput = z.object({
  action: z.enum(["pause", "resume", "delete"]),
  platform: z.string().trim().min(1),
  roomId: z.string().trim().min(1),
});

export const UpdateRecorderConfigInput = z.object({
  quality: z.enum(["uhd", "hd", "sd"]),
  segment_time: z.number().int().min(0).max(240),
  check_interval: z.number().int().min(10).max(600),
});

export const DeleteRecordingFileInput = z.object({
  anchor: z.string().trim().min(1).max(120),
  file: z.string().trim().min(1).max(300),
});
