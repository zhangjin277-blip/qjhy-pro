import { redirect } from "next/navigation";
import {
  listCategories,
  listItems,
  requireSoftwareViewer,
} from "@/modules/software-library/server";
import { SoftwareLibrary } from "./_components/software-library";

export const dynamic = "force-dynamic";

export default async function SoftwarePage() {
  let canEdit = false;
  try {
    const { perm } = await requireSoftwareViewer();
    canEdit = perm.points.has("item_edit");
  } catch {
    redirect("/dashboard");
  }

  const [categories, list] = await Promise.all([
    listCategories(),
    listItems({ page: 1, pageSize: 100 }),
  ]);

  return (
    <SoftwareLibrary
      initialCategories={categories}
      initialItems={list.items}
      initialTotal={list.total}
      canEdit={canEdit}
    />
  );
}
