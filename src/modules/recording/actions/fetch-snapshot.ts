"use server";
import { requireRecordingViewer } from "../authz";
import { getRecorderSnapshot } from "../snapshot";
import type { RecorderSnapshot } from "../types";

export async function fetchRecorderSnapshot(): Promise<RecorderSnapshot> {
  await requireRecordingViewer();
  return getRecorderSnapshot();
}
