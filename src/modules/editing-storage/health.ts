import "server-only";
import { access, writeFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export type NasHealth = { ok: true } | { ok: false; reason: string };

export async function checkNasMount(path: string): Promise<NasHealth> {
  try {
    await access(path, constants.F_OK | constants.W_OK);
    const probe = join(path, `.health-${process.pid}-${Date.now()}`);
    await writeFile(probe, "ok");
    await unlink(probe);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? `${e.message}` : String(e) };
  }
}
