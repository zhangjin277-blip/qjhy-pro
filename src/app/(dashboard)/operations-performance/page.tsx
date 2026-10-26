import { redirect } from "next/navigation";

/** Retired editor: existing bookmarks now open the unified goal manager. */
export default function OperationsPerformancePage() {
  redirect("/goals");
}
