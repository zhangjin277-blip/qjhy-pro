/**
 * 别名模块的客户端 + 服务端通用入口。
 * 仅暴露：类型 / Zod schema / Server Actions。
 *
 * 服务端专用查询（如 getDeptAliasMap）从兄弟文件 ./server import，
 * 否则会把 db 客户端拖进 client bundle。
 */
export type { EntityType, AliasRow, DeptAliasMap } from "./types";

export {
  EntityTypeSchema,
  UpsertAliasInput,
  DeleteAliasInput,
  type UpsertAliasInputType,
  type DeleteAliasInputType,
} from "./schema";

export { upsertAlias, deleteAlias } from "./actions";
