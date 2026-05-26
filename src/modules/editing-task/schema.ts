import { z } from "zod";

export const CreateTaskInput = z.object({
  liveAccountId: z.string().min(1),
  anchorId: z.string().optional().nullable(),
  materialDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceRemark: z.string().max(500).optional().nullable(),
  priority: z.enum(["normal", "urgent"]).optional(),
  urgentReason: z.string().max(200).optional().nullable(),
});

export const UploadSourceInput = z.object({
  taskId: z.number().int().positive(),
  // 文件本身用 formData 传，这里只校验元数据
  fileName: z.string().min(1).max(255),
});

export const AssignEditorInput = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(100),
  editorUserId: z.string().min(1),
});

export const ReviewRejectInput = z.object({
  taskId: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export const MarkPublishedInput = z.object({
  taskId: z.number().int().positive(),
  // 三种情况：① undefined → 走自动绑定 ② string → 手填 ③ null → admin 强制跳过
  videoId: z.union([z.string().min(3), z.null()]).optional(),
});

export const DeleteTaskInput = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(100),
});

export const ToggleDisqualifiedInput = z.object({
  taskId: z.number().int().positive(),
  disqualified: z.boolean(),
  reason: z.string().max(200).optional().nullable(),
});

export const SetPriorityInput = z.object({
  taskId: z.number().int().positive(),
  priority: z.enum(["normal", "urgent"]),
  urgentReason: z.string().max(200).optional().nullable(),
});

export const BoardFilterInput = z.object({
  productNames: z.array(z.string()).optional(),
  anchorIds: z.array(z.string()).optional(),
  editorUserIds: z.array(z.string()).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
