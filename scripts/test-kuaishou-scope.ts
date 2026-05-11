import { listKuaishouAnchors } from "@/modules/anchors/server";
import { resolvePermission } from "@/modules/permissions/server";

const USERS = [
  { name: "龚诗彧", id: "030208242140398730" },
  { name: "张锦", id: "0526301817793094" },
  { name: "朱江源", id: "253227063726275074" },
];

async function main() {
  for (const u of USERS) {
    const perm = await resolvePermission(u.id, "anchors");
    const rows = await listKuaishouAnchors(u.id, {});
    console.log(
      `${u.name} → perm.scope=${perm.scope}, sources=${JSON.stringify(perm.sources)}, ${rows.length} 行`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
