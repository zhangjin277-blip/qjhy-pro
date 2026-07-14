import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/page-auth";
import { getCategories, getStreamerList, type StreamerView } from "@/modules/live-recording/server";
import { RecordingList } from "./_components/recording-list";

export const dynamic = "force-dynamic";

export default async function LiveRecordingPage() {
  try {
    await requireUser();
  } catch {
    redirect("/dashboard");
  }

  let streamers: StreamerView[] = [];
  let categories: string[] = [];
  let loadError: string | null = null;
  try {
    [streamers, categories] = await Promise.all([getStreamerList(), getCategories()]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "读取录制名单失败";
  }

  return <RecordingList streamers={streamers} categories={categories} loadError={loadError} />;
}
