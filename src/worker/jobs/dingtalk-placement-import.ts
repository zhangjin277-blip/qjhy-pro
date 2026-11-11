import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const EXPECTED_DATASETS = ["product_buyu", "product_ue4", "product_urp"] as const;

type DatasetId = (typeof EXPECTED_DATASETS)[number];

interface ReportCandidate {
  url: string;
  messageTime: string;
  expectedReportDate: string | null;
  datasetId: DatasetId | null;
}

export interface DingtalkPlacementImportResult {
  imported: string[];
  skipped: string[];
  failed: string[];
}

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
  const xlsx = text.match(/https?:\/\/[^\s)\]<>]+\.xlsx(?:\?[^\s)\]<>]+)?/i)?.[0];
  if (xlsx) return xlsx;
  return (
    text.match(
      /https?:\/\/alidocs\.dingtalk\.com\/i\/nodes\/[A-Za-z0-9_-]+(?:\?[^\s)\]<>]+)?/i,
    )?.[0] ?? null
  );
}

function extractReportDate(text: string): string | null {
  return text.match(/日报(?:汇总)?[-_](\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function extractDatasetId(text: string): DatasetId | null {
  const product =
    text.match(/【\s*(3D|UE4|URP)日报\s*】/i)?.[1] ??
    text.match(/\b(3D|UE4|URP)(?:分)?直播间日报/i)?.[1];
  if (!product) return null;
  if (product.toUpperCase() === "3D") return "product_buyu";
  if (product.toUpperCase() === "UE4") return "product_ue4";
  return "product_urp";
}

function placementProfileArgs(): string[] {
  const profile = env.DINGTALK_PLACEMENT_DAILY_PROFILE || env.DINGTALK_CLI_PROFILE;
  return profile ? ["--profile", profile] : [];
}

function describeSource(url: string): string {
  const parsed = new URL(url);
  const tail = decodeURIComponent(parsed.pathname.split("/").at(-1) ?? parsed.pathname);
  return `${parsed.hostname}:${tail}`;
}

async function readReportMessages(includeLateMessages: boolean): Promise<ReportCandidate[]> {
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
  args.push(...placementProfileArgs());

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
      datasetId: message.text ? extractDatasetId(message.text) : null,
    }))
    .filter((message): message is ReportCandidate => Boolean(message.url))
    .sort((a, b) => b.messageTime.localeCompare(a.messageTime));
  const inTimeWindow = includeLateMessages
    ? candidates
    : candidates.filter((candidate) => {
        const match = candidate.messageTime.match(/\s(\d{1,2}):(\d{2}):/);
        const hour = match ? Number(match[1]) : Number.NaN;
        const minute = match ? Number(match[2]) : Number.NaN;
        return (
          hour === 11 &&
          Number.isInteger(minute) &&
          minute >= REPORT_MESSAGE_MINUTE_FROM &&
          minute <= REPORT_MESSAGE_MINUTE_TO
        );
      });
  const latestReportDate = inTimeWindow
    .map((candidate) => candidate.expectedReportDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const latestDateCandidates = latestReportDate
    ? inTimeWindow.filter((candidate) => candidate.expectedReportDate === latestReportDate)
    : inTimeWindow;
  const selectedDatasets = new Set<DatasetId>();
  const reportCandidates = latestDateCandidates.filter((candidate) => {
    if (!candidate.datasetId) return true;
    if (selectedDatasets.has(candidate.datasetId)) return false;
    selectedDatasets.add(candidate.datasetId);
    return true;
  });
  if (reportCandidates.length === 0)
    throw new Error(
      includeLateMessages
        ? `群聊没有找到日报表格：${REPORT_GROUP}`
        : `群聊没有找到 11:00-11:10 的日报表格：${REPORT_GROUP}`,
    );
  return reportCandidates;
}

async function downloadReport(candidate: ReportCandidate): Promise<{
  buffer: Buffer;
  sourceName: string;
}> {
  const parsedUrl = new URL(candidate.url);
  if (parsedUrl.hostname === "alidocs.dingtalk.com") {
    const directory = await mkdtemp(join(tmpdir(), "qjhy-buyu-report-"));
    const sourceName = `online-${candidate.datasetId ?? "report"}-${candidate.expectedReportDate ?? "latest"}.xlsx`;
    const outputPath = join(directory, sourceName);
    try {
      await execFileAsync(
        env.DINGTALK_CLI_PATH,
        [
          "sheet",
          "export",
          ...placementProfileArgs(),
          "--node",
          candidate.url,
          "--output",
          outputPath,
        ],
        {
          cwd: process.cwd(),
          timeout: 360_000,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      const buffer = await readFile(outputPath);
      if (buffer.length === 0) throw new Error("在线表格导出为空");
      return { buffer, sourceName };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  const response = await fetch(candidate.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`下载 Excel 失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("下载 Excel 为空");
  const sourceName = decodeURIComponent(parsedUrl.pathname.split("/").at(-1) ?? parsedUrl.pathname);
  return { buffer, sourceName };
}

async function wasImported(fileName: string): Promise<boolean> {
  const rows = await db
    .select({ id: placement_import_batch.id })
    .from(placement_import_batch)
    .where(eq(placement_import_batch.file_name, fileName))
    .limit(1);
  return rows.length > 0;
}

export async function runDingtalkPlacementImport(options?: {
  includeLateMessages?: boolean;
}): Promise<DingtalkPlacementImportResult> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  try {
    const candidates = await readReportMessages(options?.includeLateMessages === true);
    const candidateDatasets = new Set(
      candidates
        .map((candidate) => candidate.datasetId)
        .filter((value): value is DatasetId => Boolean(value)),
    );
    for (const datasetId of EXPECTED_DATASETS) {
      if (!candidateDatasets.has(datasetId)) failed.push(`未找到 ${datasetId} 的最新日报`);
    }
    const selectedDatasets = new Set<string>();
    for (const latest of candidates) {
      try {
        const { buffer, sourceName } = await downloadReport(latest);
        const parsed = parseXlsx(buffer, sourceName);
        const sheetName = String(parsed.rows[0]?.raw._source_sheet ?? "");
        const parsedDatasetId = sheetName?.startsWith("3D")
          ? "product_buyu"
          : sheetName?.startsWith("UE4")
            ? "product_ue4"
            : sheetName?.startsWith("URP")
              ? "product_urp"
              : null;
        const datasetId = latest.datasetId ?? parsedDatasetId;
        if (!datasetId) throw new Error(`无法从日报 sheet 判断产品：${String(sheetName)}`);
        if (latest.datasetId && parsedDatasetId && latest.datasetId !== parsedDatasetId) {
          throw new Error(`消息产品与在线表格不一致：${latest.datasetId} / ${parsedDatasetId}`);
        }
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
        const fileName = `dingtalk:${REPORT_GROUP}:${datasetId}:${parsed.date_range_to ?? latest.expectedReportDate ?? "unknown"}:${sourceName}:report-v2`;
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
        const source = describeSource(latest.url);
        failed.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`[dingtalk-placement] ${source} failed:`, error);
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
  return { imported, skipped, failed };
}
