import type { DepartmentMember, DepartmentOverview } from "./workbench-management-types";
import type { DeptAliasMap } from "@/modules/aliases";
export interface PersonnelSource extends DepartmentMember {
  deptIds: string[];
}
export function aggregateDepartments(
  people: PersonnelSource[],
  depts: { id: string; name: string; parentId: string | null }[],
  month: string,
  aliases?: DeptAliasMap,
): DepartmentOverview[] {
  const map = new Map(depts.map((d) => [d.id, d]));
  function label(id: string): string {
    const parts: string[] = [];
    const seen = new Set<string>();
    let next: string | null = id;
    while (next && !seen.has(next)) {
      seen.add(next);
      const dept = map.get(next);
      if (!dept) break;
      parts.unshift(dept.name);
      next = dept.parentId;
    }
    return parts.slice(-3).join(" / ") || "未分配部门";
  }
  const groups = new Map<string, DepartmentMember[]>();
  for (const person of people) {
    // One person belongs to one row: DingTalk's first department is the primary assignment.
    const id = person.deptIds[0] || "unassigned";
    const members = groups.get(id) || [];
    members.push(person);
    groups.set(id, members);
  }
  return [...groups]
    .map(([id, members]) => {
      const active = members.filter((m) => m.status !== "inactive");
      return {
        id,
        name: aliases?.get(id)?.alias.trim() || label(id),
        originalName: label(id),
        active: active.length,
        probation: active.filter((m) => m.status === "probation").length,
        unknown: active.filter((m) => m.status === "unknown").length,
        hired: members.filter((m) => m.firstSyncedDate?.startsWith(month)).length,
        inactive: members.filter((m) => m.status === "inactive").length,
        departed: members.filter((m) => m.lastInactiveDate?.startsWith(month)).length,
        absent: active.some((m) => m.absent === null)
          ? null
          : active.filter((m) => m.absent).length,
        leave: active.some((m) => m.leave === null) ? null : active.filter((m) => m.leave).length,
        members,
      };
    })
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, "zh-CN"));
}
