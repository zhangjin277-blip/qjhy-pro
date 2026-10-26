import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "@/db/client";
import { placement_import_batch } from "@/db/schema/placements";
import { ingestRows, parseXlsx } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";
import { env } from "@/lib/env";
import { notifyPlacementAlert } from "@/lib/notify";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

const REPORT_GROUP = "捕鱼直播间日报推送";
const REPORT_CONVERSATION_ID = "cidtt6Tpl7axtiBk5fKYUpcEQ==";

interface ChatMessage {
  createTime?: string;
  text?: string;
}

interface ChatMessagesResult {
  messages?: ChatMessage[];
  complete?: boolean;
  failures?: unknown[];
}

const REPORT_MESSAGE_MINUTE_FROM = 0;
const REPORT_MESSAGE_MINUTE_TO = 10;

function extractSpreadsheetUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)\]<>]+\.xlsx(?:\?[^\s)\]<>]+)?/i);
  return match?.[0] ?? null;
}

function extractReportDate(text: string): string | null {
  return text.match(/日报(?:汇总)?[-_](\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

async function readReportMessages(): Promise<
  { url: string; messageTime: string; expectedReportDate: string | null }[]
> {
  const args = [
    "chat",
    "+chat-messages",
    "--group",
    REPORT_CONVERSATION_ID,
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
      console.warn(`[dingtalk-placement] retrying chat read: ${REPORT_GROUP}`);
    }
  }
  if (lastError) throw lastError;
  const result = JSON.parse(stdout) as ChatMessagesResult;
  const messages = result.messages ?? [];
  // DWS may fail enrichment (for example reaction lookup) while still
  // returning the actual chat messages and their file links. Keep those
  // usable messages; only fail when no message payload is available.
  if (result.failures?.length && messages.length === 0) {
    throw new Error(`读取群聊失败：${JSON.stringify(result.failures)}`);
  }
  if (result.failures?.length) {
    console.warn(
      `[dingtalk-placement] chat read returned ${result.failures.length} partial failures: ${REPORT_GROUP}`,
    );
  }
  const candidates = messages
    .map((message) => ({
      url: message.text ? extractSpreadsheetUrl(message.text) : null,
      messageTime: message.createTime ?? "",
      expectedReportDate: message.text ? extractReportDate(message.text) : null,
    }))
    .filter(
      (
        message,
      ): message is { url: string; messageTime: string; expectedReportDate: string | null } =>
        Boolean(message.url),
    )
    .sort((a, b) => b.messageTime.localeCompare(a.messageTime));
  const reportCandidates = candidates.filter((candidate) => {
    const match = candidate.messageTime.match(/\s\d{1,2}:(\d{2}):/);
    const minute = match ? Number(match[1]) : Number.NaN;
    return (
      Number.isInteger(minute) &&
      minute >= REPORT_MESSAGE_MINUTE_FROM &&
      minute <= REPORT_MESSAGE_MINUTE_TO
    );
  });
  if (reportCandidates.length === 0)
    throw new Error(`群聊没有找到 11:00-11:10 的日报附件：${REPORT_GROUP}`);
  return reportCandidates;
}

async function wasImported(fileName: string): Promise<boolean> {
  const rows = await db
    .select({ id: placement_import_batch.id })
    .from(placement_import_batch)
    .where(eq(placement_import_batch.file_name, fileName))
    .limit(1);
  return rows.length > 0;
}

export async function runDingtalkPlacementImport(): Promise<void> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  try {
    const candidates = await readReportMessages();
    const selectedDatasets = new Set<string>();
    for (const latest of candidates) {
      try {
        const parsedUrl = new URL(latest.url);
        const response = await fetch(latest.url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) {
          throw new Error(`下载 Excel 失败：HTTP ${response.status} ${latest.url}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length === 0) throw new Error(`下载 Excel 为空：${latest.url}`);

        const baseName = decodeURIComponent(
          parsedUrl.pathname.split("/").at(-1) ?? parsedUrl.pathname,
        );
        const parsed = parseXlsx(buffer, baseName);
        const sheetName = String(parsed.rows[0]?.raw._source_sheet ?? "");
        const datasetId = sheetName?.startsWith("3D")
          ? "product_buyu"
          : sheetName?.startsWith("UE4")
            ? "product_ue4"
            : sheetName?.startsWith("URP")
              ? "product_urp"
              : null;
        if (!datasetId) throw new Error(`无法从日报 sheet 判断产品：${String(sheetName)}`);
        if (selectedDatasets.has(datasetId)) continue;
        if (parsed.rows.length === 0) {
          throw new Error(
            `Excel 未解析出有效数据：${REPORT_GROUP}${parsed.errors.length ? `；${parsed.errors[0]?.reason}` : ""}`,
          );
        }
        if (latest.expectedReportDate && parsed.date_range_to !== latest.expectedReportDate) {
          throw new Error(
            `日报日期不一致：消息声明 ${latest.expectedReportDate}，Excel 最晚日期 ${parsed.date_range_to ?? "空"}（范围 ${parsed.date_range_from ?? "空"} 至 ${parsed.date_range_to ?? "空"}）`,
          );
        }
        const fileName = `dingtalk:${REPORT_GROUP}:${datasetId}:${parsed.date_range_to ?? latest.expectedReportDate ?? "unknown"}:${baseName}:report-v2`;
        if (await wasImported(fileName)) {
          skipped.push(fileName);
          selectedDatasets.add(datasetId);
          console.log(`[dingtalk-placement] skipped existing ${fileName}`);
          continue;
        }
        const batch = await ingestRows({
          // 自动群文件与手动上传共用同一套累计快照/重算语义。
          source: "excel-upload",
          dataset_id: datasetId,
          granularity: "daily",
          file_name: fileName,
          file_size_bytes: buffer.length,
          uploaded_by: null,
          rows: parsed.rows,
          parse_errors: parsed.errors,
        });
        runAttributionJob({ batch_id: batch.id }).catch((error: unknown) => {
          console.error(`[dingtalk-placement] attribution failed batch=${batch.id}`, error);
        });
        console.log(
          `[dingtalk-placement] imported ${fileName} message=${latest.messageTime} rows=${parsed.rows.length} batch=${batch.id}`,
        );
        imported.push(fileName);
        selectedDatasets.add(datasetId);
      } catch (error) {
        failed.push(`${latest.url}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`[dingtalk-placement] ${latest.url} failed:`, error);
      }
    }
  } catch (error) {
    failed.push(`${REPORT_GROUP}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`[dingtalk-placement] ${REPORT_GROUP} failed:`, error);
  }
  if (failed.length > 0 || imported.length + skipped.length === 0) {
    await notifyPlacementAlert({
      title: "捕鱼直播日报导入异常",
      detail: [
        `时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
        `成功写入：${imported.length ? imported.join("、") : "无"}`,
        `已存在跳过：${skipped.length ? skipped.join("、") : "无"}`,
        `失败：${failed.length ? failed.join("；") : "全部未返回有效数据"}`,
      ].join("\n"),
    });
  }
}
