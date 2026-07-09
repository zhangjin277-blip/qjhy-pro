"use server";
import { requireSoftwareViewer } from "../authz";
import { listItems } from "../queries";
import { ListItemsInput } from "../schema";
import type { SoftwareListResult } from "../types";

/** 客户端分类切换/搜索用的列表拉取。 */
export async function fetchItems(input: unknown): Promise<SoftwareListResult> {
  const data = ListItemsInput.parse(input);
  await requireSoftwareViewer();
  return listItems(data);
}
