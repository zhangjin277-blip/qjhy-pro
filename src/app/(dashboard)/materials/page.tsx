import { redirect } from "next/navigation";
import {
  listFolderTree,
  listAssets,
  requireMaterialViewer,
} from "@/modules/material-library/server";
import { MaterialLibrary } from "./_components/material-library";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  let userId: string;
  try {
    ({ userId } = await requireMaterialViewer());
  } catch {
    redirect("/dashboard");
  }

  const [folders, assets] = await Promise.all([
    listFolderTree(),
    listAssets({ page: 1, pageSize: 200 }, userId),
  ]);

  return <MaterialLibrary folders={folders} initialAssets={assets.items} currentUserId={userId} />;
}
