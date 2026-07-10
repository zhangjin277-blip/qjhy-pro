import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/page-auth";
import {
  listFiles,
  listStreamerFolders,
  type RecordingFile,
  type StreamerFolder,
} from "@/modules/live-recording/server";
import { RecordingFiles } from "./_components/recording-files";

export const dynamic = "force-dynamic";

/**
 * 区分「真的没有录像」与「录像目录不可访问」:后者是配置/挂载故障,升级为错误横幅,
 * 不静默成「暂无录像」。
 */
export default async function RecordingFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  try {
    await requireUser();
  } catch {
    redirect("/dashboard");
  }

  let folders: StreamerFolder[];
  try {
    folders = await listStreamerFolders();
  } catch (e) {
    return (
      <RecordingFiles
        folders={[]}
        selected={null}
        files={[]}
        rootError={e instanceof Error ? e.message : "录像目录不可访问"}
      />
    );
  }

  const { s } = await searchParams;
  const selected = s && folders.some((f) => f.name === s) ? s : (folders[0]?.name ?? null);
  let files: RecordingFile[] = [];
  if (selected) files = await listFiles(selected).catch(() => []);

  return <RecordingFiles folders={folders} selected={selected} files={files} rootError={null} />;
}
