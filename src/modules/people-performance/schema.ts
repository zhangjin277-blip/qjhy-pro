import { z } from "zod";

export const SaveProfileInput = z
  .object({
    userId: z.string().min(1),
    managerUserId: z.string().min(1),
    skipManagerUserId: z.string().min(1).nullable(),
    hireDate: z.iso.date(),
    employmentStatus: z.enum(["probation", "regular", "inactive"]),
    probationMonths: z.union([z.literal(2), z.literal(6)]),
    regularizedAt: z.iso.date().nullable().optional(),
  })
  .refine((data) => data.userId !== data.managerUserId, {
    message: "直属上级不能是员工本人",
    path: ["managerUserId"],
  })
  .refine((data) => data.skipManagerUserId === null || data.userId !== data.skipManagerUserId, {
    message: "隔级上级不能是员工本人",
    path: ["skipManagerUserId"],
  });

export const GoalInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  metric: z.string().trim().max(500).default(""),
  targetValue: z.string().trim().max(500).default(""),
  weight: z.number().positive().max(100),
});

export const SubmitGoalsInput = z
  .object({ cycleId: z.string().min(1), goals: z.array(GoalInput).min(1).max(20) })
  .refine((data) => Math.abs(data.goals.reduce((sum, goal) => sum + goal.weight, 0) - 100) < 0.01, {
    message: "目标权重合计必须为100%",
    path: ["goals"],
  });

const GoalTemplateListInput = z
  .array(GoalInput.omit({ id: true }))
  .max(20)
  .refine(
    (goals) =>
      goals.length === 0 ||
      Math.abs(goals.reduce((sum, goal) => sum + goal.weight, 0) - 100) < 0.01,
    { message: "目标权重合计必须为100%" },
  );

export const BulkConfigureProfilesInput = z
  .object({
    userIds: z.array(z.string().min(1)).min(1).max(200),
    managerUserId: z.string().min(1),
    skipManagerUserId: z.string().min(1).nullable(),
    employmentStatus: z.enum(["probation", "regular"]),
    probationMonths: z.union([z.literal(2), z.literal(6)]),
    hireDateOverride: z.iso.date().optional(),
    applyProbationGoals: z.boolean(),
    probationGoals: GoalTemplateListInput,
    applyPerformanceGoals: z.boolean(),
    performanceGoals: GoalTemplateListInput,
  })
  .superRefine((data, context) => {
    if (data.applyProbationGoals && data.probationGoals.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["probationGoals"],
        message: "请至少配置一个试用期目标",
      });
    }
    if (data.applyPerformanceGoals && data.performanceGoals.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["performanceGoals"],
        message: "请至少配置一个绩效目标",
      });
    }
  });

export const ReviewGoalsInput = z.object({
  cycleId: z.string().min(1),
  approved: z.boolean(),
  comment: z.string().trim().max(1000).default(""),
});

export const SelfReviewInput = z.object({
  cycleId: z.string().min(1),
  summary: z.string().trim().min(1).max(3000),
  goals: z.array(
    z.object({
      id: z.string().min(1),
      completion: z.string().trim().min(1).max(2000),
      score: z.number().min(0).max(100),
    }),
  ),
});

export const ManagerReviewInput = z.object({
  cycleId: z.string().min(1),
  summary: z.string().trim().min(1).max(3000),
  goals: z.array(
    z.object({
      id: z.string().min(1),
      score: z.number().min(0).max(100),
      comment: z.string().trim().max(1000).default(""),
    }),
  ),
});

export const CalibrateInput = z.object({
  cycleId: z.string().min(1),
  comment: z.string().trim().min(1).max(3000),
  probationResult: z.enum(["passed", "extended", "failed"]).nullable().optional(),
});

export const CycleIdInput = z.object({ cycleId: z.string().min(1) });
export const PersonIdInput = z.object({ userId: z.string().min(1) });

export type SaveProfileInput = z.infer<typeof SaveProfileInput>;
export type SubmitGoalsInput = z.infer<typeof SubmitGoalsInput>;
export type BulkConfigureProfilesInput = z.infer<typeof BulkConfigureProfilesInput>;
