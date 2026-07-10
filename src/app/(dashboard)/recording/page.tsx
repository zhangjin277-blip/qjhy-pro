import { redirect } from "next/navigation";
import { getRecorderSnapshot, requireRecordingViewer } from "@/modules/recording/server";
import { RecordingTasks } from "./_components/recording-tasks";

export const dynamic = "force-dynamic";

export default async function RecordingPage() {
  let canEdit = false;
  try {
    const { perm } = await requireRecordingViewer();
    canEdit = perm.can_edit;
  } catch {
    redirect("/dashboard");
  }

  const snapshot = await getRecorderSnapshot();
  return <RecordingTasks initialSnapshot={snapshot} canEdit={canEdit} />;
}
