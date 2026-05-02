/**
 * brokers 模块的客户端 + 服务端通用入口。
 * 仅暴露：类型 / Zod schema / Server Actions。
 *
 * 服务端专用函数（syncBrokerMappings / listBrokerMappings）从 ./server import，
 * 否则会把 db 客户端拖进 client bundle。
 */
export type { BrokerMappingRow } from "./types";
export { SetBrokerMappingInput, type SetBrokerMappingInputType } from "./schema";
export { setBrokerMapping } from "./actions";
