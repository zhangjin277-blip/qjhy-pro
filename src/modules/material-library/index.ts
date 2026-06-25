export type { MaterialType, FolderTreeNode, AssetListItem, AssetListResult } from "./types";

export {
  MaterialTypeEnum,
  CreateFolderInput,
  RenameFolderInput,
  DeleteFolderInput,
  UpdateAssetInput,
  DeleteAssetInput,
  ListAssetsInput,
} from "./schema";

export { createFolder } from "./actions/create-folder";
export { renameFolder } from "./actions/rename-folder";
export { deleteFolder } from "./actions/delete-folder";
export { updateAsset } from "./actions/update-asset";
export { deleteAsset } from "./actions/delete-asset";
export { fetchAssets } from "./actions/list-assets";
export { toggleFavorite } from "./actions/toggle-favorite";
export { batchMoveAssets } from "./actions/batch-move";
export { batchDeleteAssets } from "./actions/batch-delete";
