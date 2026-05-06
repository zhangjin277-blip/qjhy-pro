import { z } from "zod";

export const RoomStatus = z.enum(["active", "inactive"]);
export type RoomStatus = z.infer<typeof RoomStatus>;

export const CreateRoomInput = z.object({
  room_no: z.string().min(1, "直播间编号不能为空"),
  location: z.string().optional(),
  status: RoomStatus.default("active"),
});
export type CreateRoomInput = z.infer<typeof CreateRoomInput>;

export const UpdateRoomInput = CreateRoomInput.extend({
  id: z.string().min(1),
});
export type UpdateRoomInput = z.infer<typeof UpdateRoomInput>;

export const DeleteRoomInput = z.object({
  id: z.string().min(1),
});
