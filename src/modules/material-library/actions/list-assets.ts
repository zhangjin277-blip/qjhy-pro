"use server";
import { requireMaterialViewer } from "../authz";
import { listAssets } from "../queries";
import { ListAssetsInput } from "../schema";
import type { AssetListResult } from "../types";

/** 客户端 mutate 后重新拉取素材列表用。 */
export async function fetchAssets(input: unknown): Promise<AssetListResult> {
  const data = ListAssetsInput.parse(input ?? {});
  const { userId } = await requireMaterialViewer();
  return listAssets(data, userId);
}
