import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "@/db/client";
import { placement_import_batch } from "@/db/schema/placements";
import { ingestRows, parseOmniXlsx, parseXlsx, type ParseResult } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";
import { env } from "@/lib/env";
import { notifyPlacementAlert } from "@/lib/notify";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

type HourlySource = {
  name: string;
  conversationId: string;
  datasetId: "product_buyu" | "product_ue4" | "product_urp";
  format: "omni" | "legacy";
};

// 每小时 05 分读取各产品自己的播报群。不要把日报群加入这里：日报是 daily 粒度，
// 小时播报是 hourly 粒度，两者分别落库，避免互相覆盖。
const SOURCES: HourlySource[] = [
  {
    name: "长沙-3D直播间-20min播报",
    conversationId: "cidzvtMjj+NVWi9xxTJdMvo4w==",
    datasetId: "product_buyu",
    format: "omni",
  },
  {
    name: "长沙-UE4直播间-20min播报",
    conversationId: "cidMuIW7MlXIwUITRjZkeoD6g==",
    datasetId: "product_ue4",
    format: "omni",
  },
  {
    name: "长沙-URP直播间-20min播报",
    conversationId: "cidX5DH5uxWesE3O/90vlr9ww==",
    datasetId: "product_urp",
    format: "omni",
  },
];

interface ChatMessage {
  createTime?: string;
  text?: string;
}

interface ChatMessagesResult {
  messages?: ChatMessage[];
  complete?: boolean;
  failures?: unknown[];
}

function extractSpreadsheetUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s)\]<>]+\.xlsx(?:\?[^\s)\]<>]+)?/i)?.[0] ?? null;
}

async function readLatestMessage(source: HourlySource): Promise<{
  url: string;
  messageTime: string;
}> {
  const args = [
    "chat",
    "+chat-messages",
    "--group",
    source.conversationId,
    "--limit",
    "30",
    "--format",
    "json",
  ];
  if (env.DINGTALK_CLI_PROFILE) args.push("--profile", env.DINGTALK_CLI_PROFILE);

  let stdout = "";
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      ({ stdout } = await execFileAsync(env.DINGTALK_CLI_PATH, args, {
        cwd: process.cwd(),
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      }));
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
      console.warn(`[dingtalk-placement-hourly] retrying chat read: ${source.name}`);
    }
  }
  if (lastError) throw lastError;

  const result = JSON.parse(stdout) as ChatMessagesResult;
  const messages = result.messages ?? [];
  if (result.failures?.length && messages.length === 0) {
    throw new Error(`读取群聊失败：${JSON.stringify(result.failures)}`);
  }
  if (result.failures?.length) {
    console.warn(
      `[dingtalk-placement-hourly] chat read returned ${result.failures.length} partial failures: ${source.name}`,
    );
  }
  const now = new Date();
  const currentDate = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const currentHour = Number(
    now.toLocaleTimeString("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false }),
  );
  const candidates = messages
    .map((message) => ({
      url: message.text ? extractSpreadsheetUrl(message.text) : null,
      messageTime: message.createTime ?? "",
    }))
    .filter((message): message is { url: string; messageTime: string } => Boolean(message.url))
    // 每小时只认整点后 00-10 分钟的文件；20/40 分钟推送必须跳过。
    .filter((message) => {
      const match = message.messageTime.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2}):/);
      if (!match) return false;
      const minute = Number(match[3]);
      return (
        match[1] === currentDate &&
        Number(match[2]) === currentHour &&
        Number.isInteger(minute) &&
        minute >= 0 &&
        minute <= 10
      );
    })
    .sort((a, b) => b.messageTime.localeCompare(a.messageTime));
  const latest = candidates.at(0);
  if (!latest) {
    throw new Error(`群聊没有找到本小时整点快照（00-10 分钟）：${source.name}`);
  }
  return latest;
}

async function wasImported(fileName: string): Promise<boolean> {
  const rows = await db
    .select({ id: placement_import_batch.id })
    .from(placement_import_batch)
    .where(eq(placement_import_batch.file_name, fileName))
    .limit(1);
  return rows.length > 0;
}

async function importSource(source: HourlySource): Promise<"imported" | "skipped"> {
  const latest = await readLatestMessage(source);
  const parsedUrl = new URL(latest.url);
  const response = await fetch(latest.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`下载 Excel 失败：HTTP ${response.status} ${latest.url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error(`下载 Excel 为空：${latest.url}`);

  const baseName = decodeURIComponent(parsedUrl.pathname.split("/").at(-1) ?? parsedUrl.pathname);
  const parsed: ParseResult =
    source.format === "omni" ? parseOmniXlsx(buffer, baseName) : parseXlsx(buffer, baseName);
  if (parsed.rows.length === 0) {
    throw new Error(
      `Excel 未解析出有效小时数据：${source.name}${parsed.errors.length ? `；${parsed.errors[0]?.reason}` : ""}`,
    );
  }

  // 文件名包含群和产品，确保同一附件重复读取时幂等，同时不影响日报 batch。
  const fileName = `dingtalk:${source.name}:${source.datasetId}:${baseName}:hourly-v1`;
  if (await wasImported(fileName)) {
    console.log(`[dingtalk-placement-hourly] skipped existing ${fileName}`);
    return "skipped";
  }

  const batch = await ingestRows({
    source: "excel-upload",
    dataset_id: source.datasetId,
    granularity: "hourly",
    file_name: fileName,
    file_size_bytes: buffer.length,
    uploaded_by: null,
    rows: parsed.rows,
    parse_errors: parsed.errors,
  });
  runAttributionJob({ batch_id: batch.id }).catch((error: unknown) => {
    console.error(`[dingtalk-placement-hourly] attribution failed batch=${batch.id}`, error);
  });
  console.log(
    `[dingtalk-placement-hourly] imported ${fileName} message=${latest.messageTime} rows=${parsed.rows.length} batch=${batch.id}`,
  );
  return "imported";
}

export async function runDingtalkPlacementHourlyImport(): Promise<void> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const source of SOURCES) {
    try {
      const result = await importSource(source);
      (result === "imported" ? imported : skipped).push(source.name);
    } catch (error) {
      const detail = `${source.name}: ${error instanceof Error ? error.message : String(error)}`;
      failed.push(detail);
      console.error(`[dingtalk-placement-hourly] ${detail}`);
    }
  }

  if (failed.length > 0) {
    await notifyPlacementAlert({
      title: "投放小时数据导入异常",
      detail: [
        `时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
        `成功写入：${imported.length ? imported.join("、") : "无"}`,
        `已存在跳过：${skipped.length ? skipped.join("、") : "无"}`,
        `失败：${failed.join("；")}`,
      ].join("\n"),
    });
  }
}
