/**
 * Integration / e2e: editing task lifecycle
 *
 * 覆盖：
 *   1. Happy path — createTask → assignEditor → review reject → review approve → markPublished
 *   2. State machine — published → reviewApprove 应抛 illegal transition
 *   3. Delete guard — published task 不可删（skipped=1）
 *
 * vi.mock 放在模块顶层以触发 Vitest 的自动 hoisting（hoistingTransform）。
 * 必须在 mock 声明之后才能 import 被测模块，让 mock 先生效。
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";

// ── mock auth ──────────────────────────────────────────────────────────────
vi.mock("@/lib/auth/page-auth", () => ({
  requireUser: vi.fn(),
  getCurrentDingtalkUser: vi.fn(),
}));

// ── mock permissions（全点开通，让全流程通过）──
vi.mock("@/modules/permissions/server", async () => {
  const actual = await vi.importActual<typeof import("@/modules/permissions/server")>(
    "@/modules/permissions/server",
  );
  const { MODULE_POINTS } =
    await vi.importActual<typeof import("@/modules/permissions")>("@/modules/permissions");
  return {
    ...actual,
    resolvePermission: vi.fn().mockImplementation((_userId: string, module: string) =>
      Promise.resolve({
        scope: "all",
        points: new Set(
          (MODULE_POINTS[module as keyof typeof MODULE_POINTS] ?? []).map((p) => p.key),
        ),
        delegatedUserIds: null,
        sources: [],
      }),
    ),
  };
});

// ── import 被测 actions（mock 已 hoist，能拦截到 requireUser）─────────────
import { db } from "@/db/client";
import { editing_task, editing_task_event, live_account, dingtalk_user } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import {
  createTask,
  assignEditor,
  reviewApprove,
  reviewReject,
  markPublished,
  deleteTask,
} from "@/modules/editing-task";

// ── test fixture IDs ───────────────────────────────────────────────────────
const TEST_OPERATOR_ID = "test-op-lifecycle-001";
const TEST_EDITOR_ID = "test-editor-lifecycle-001";
const TEST_ACCOUNT_ID = "test-acc-lifecycle-e2e";

// ── global setup: 准备 dingtalk_user + live_account fixture ───────────────
beforeAll(async () => {
  // 先删旧 fixture（防止上次测试脏数据残留）
  await db.execute(
    sql`DELETE FROM editing_task_event WHERE task_id IN (SELECT id FROM editing_task WHERE live_account_id = ${TEST_ACCOUNT_ID})`,
  );
  await db.execute(sql`DELETE FROM editing_task WHERE live_account_id = ${TEST_ACCOUNT_ID}`);
  await db.delete(live_account).where(eq(live_account.id, TEST_ACCOUNT_ID));
  await db.delete(dingtalk_user).where(eq(dingtalk_user.user_id, TEST_OPERATOR_ID));
  await db.delete(dingtalk_user).where(eq(dingtalk_user.user_id, TEST_EDITOR_ID));

  await db
    .insert(dingtalk_user)
    .values([
      {
        user_id: TEST_OPERATOR_ID,
        unionid: TEST_OPERATOR_ID + "_u",
        name: "测试运营-lifecycle",
        raw: {},
      },
      {
        user_id: TEST_EDITOR_ID,
        unionid: TEST_EDITOR_ID + "_u",
        name: "测试剪辑师-lifecycle",
        title: "剪辑",
        raw: {},
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(live_account)
    .values({
      id: TEST_ACCOUNT_ID,
      account_name: "测试账号-生命周期",
      platform: "抖音",
      product: "捕鱼大作战",
      raw: {},
    })
    .onConflictDoNothing();
});

// ── global teardown: 清理 fixture ─────────────────────────────────────────
afterAll(async () => {
  await db.execute(
    sql`DELETE FROM editing_task_event WHERE task_id IN (SELECT id FROM editing_task WHERE live_account_id = ${TEST_ACCOUNT_ID})`,
  );
  await db.execute(sql`DELETE FROM editing_task WHERE live_account_id = ${TEST_ACCOUNT_ID}`);
  await db.delete(live_account).where(eq(live_account.id, TEST_ACCOUNT_ID));
  await db.delete(dingtalk_user).where(eq(dingtalk_user.user_id, TEST_OPERATOR_ID));
  await db.delete(dingtalk_user).where(eq(dingtalk_user.user_id, TEST_EDITOR_ID));
});

// ── 每个测试清空 editing_task（仅本账号）────────────────────────────────
beforeEach(async () => {
  await db.execute(
    sql`DELETE FROM editing_task_event WHERE task_id IN (SELECT id FROM editing_task WHERE live_account_id = ${TEST_ACCOUNT_ID})`,
  );
  await db.execute(sql`DELETE FROM editing_task WHERE live_account_id = ${TEST_ACCOUNT_ID}`);
});

// ── helpers ────────────────────────────────────────────────────────────────
function mockOperator() {
  vi.mocked(requireUser).mockResolvedValue({ userId: TEST_OPERATOR_ID });
}

async function fetchTask(taskId: number) {
  const rows = await db.select().from(editing_task).where(eq(editing_task.id, taskId));
  expect(rows).toHaveLength(1);
  // After the length assertion above, rows[0] is guaranteed to exist.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return rows[0]!;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("editing task lifecycle (integration)", () => {
  it("happy path: uploaded → editing → review → editing(reject) → review → ready → published", async () => {
    mockOperator();

    // 1) createTask → status=uploaded
    const createResult = await createTask({
      liveAccountId: TEST_ACCOUNT_ID,
      anchorId: null,
      materialDate: "2026-05-25",
      sourceRemark: "素材备注",
      force: true,
    });
    expect("taskId" in createResult).toBe(true);
    const { taskId } = createResult as { taskId: number };

    let t = await fetchTask(taskId);
    expect(t.status).toBe("uploaded");
    expect(t.created_by_user_id).toBe(TEST_OPERATOR_ID);

    // 2) 模拟 uploadSource（直接写 DB，跳过真实文件 IO）
    await db
      .update(editing_task)
      .set({
        source_files: ["fake/raw.mp4"],
        source_file_names: ["raw.mp4"],
        source_uploaded_at: new Date(),
      })
      .where(eq(editing_task.id, taskId));

    // 3) assignEditor → uploaded → editing
    const assignResult = await assignEditor({
      taskIds: [taskId],
      editorUserId: TEST_EDITOR_ID,
    });
    expect(assignResult.updated).toBe(1);
    expect(assignResult.skipped).toBe(0);

    t = await fetchTask(taskId);
    expect(t.status).toBe("editing");
    expect(t.editor_user_id).toBe(TEST_EDITOR_ID);

    // 4) 模拟 uploadEdited + 进入 review 状态（直接写 DB）
    await db
      .update(editing_task)
      .set({
        edited_files: ["fake/edited.mp4"],
        edited_file_names: ["v1.mp4"],
        edited_uploaded_at: new Date(),
        status: "review",
      })
      .where(eq(editing_task.id, taskId));

    // 5) reviewReject → review → editing（保留 editor）
    const rejectResult = await reviewReject({ taskId, reason: "字幕有误，需修改" });
    expect(rejectResult.ok).toBe(true);

    t = await fetchTask(taskId);
    expect(t.status).toBe("editing");
    expect(t.editor_user_id).toBe(TEST_EDITOR_ID); // 仍保留原 editor

    // 6) 剪辑师重新提交（模拟）
    await db.update(editing_task).set({ status: "review" }).where(eq(editing_task.id, taskId));

    // 7) reviewApprove → review → ready
    const approveResult = await reviewApprove({ taskId });
    expect(approveResult.ok).toBe(true);

    t = await fetchTask(taskId);
    expect(t.status).toBe("ready");
    expect(t.reviewed_by_user_id).toBe(TEST_OPERATOR_ID);

    // 8) markPublished（videoId=null → admin 强制跳过，permissions mock 已设 can_admin=true）
    const publishResult = await markPublished({ taskId, videoId: null });
    expect(publishResult.ok).toBe(true);

    t = await fetchTask(taskId);
    expect(t.status).toBe("published");
    expect(t.published_by_user_id).toBe(TEST_OPERATOR_ID);

    // 9) 验证事件流完整性（≥5 条，含关键事件类型）
    const events = await db
      .select()
      .from(editing_task_event)
      .where(eq(editing_task_event.task_id, taskId));

    expect(events.length).toBeGreaterThanOrEqual(5);

    const eventTypes = events.map((e) => e.event_type);
    expect(eventTypes).toContain("created");
    expect(eventTypes).toContain("assigned");
    expect(eventTypes).toContain("review_rejected");
    expect(eventTypes).toContain("review_approved");
    expect(eventTypes).toContain("published");
  });

  it("state machine: published → reviewApprove 应抛 illegal transition", async () => {
    mockOperator();

    const r1 = await createTask({
      liveAccountId: TEST_ACCOUNT_ID,
      anchorId: null,
      materialDate: "2026-05-25",
      sourceRemark: null,
      force: true,
    });
    const { taskId } = r1 as { taskId: number };

    // 强制置为 published（跳过正常流程）
    await db.update(editing_task).set({ status: "published" }).where(eq(editing_task.id, taskId));

    await expect(reviewApprove({ taskId })).rejects.toThrow(/illegal/i);
  });

  it("delete guard: published task 不可被删除（skipped=1, deleted=0）", async () => {
    mockOperator();

    const r2 = await createTask({
      liveAccountId: TEST_ACCOUNT_ID,
      anchorId: null,
      materialDate: "2026-05-25",
      sourceRemark: null,
      force: true,
    });
    const { taskId } = r2 as { taskId: number };

    // 强制置为 published
    await db.update(editing_task).set({ status: "published" }).where(eq(editing_task.id, taskId));

    const result = await deleteTask({ taskIds: [taskId] });
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(1);

    // 任务仍在 DB
    const still = await fetchTask(taskId);
    expect(still).toBeDefined();
    expect(still.status).toBe("published");
  });
});
