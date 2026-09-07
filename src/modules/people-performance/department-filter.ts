export interface PerformanceDepartment {
  id: string;
  name: string;
  parentId: string | null;
}

const PERFORMANCE_ROOT_DEPARTMENT = "直播一部";
const PERFORMANCE_TEAM_NAMES = new Set(["运营", "后期", "公共支持"]);

/** Resolve the three personnel-performance teams and every nested DingTalk department below them. */
export function resolvePerformanceDepartmentIds(departments: PerformanceDepartment[]): Set<string> {
  const rootIds = new Set(
    departments
      .filter((department) => department.name === PERFORMANCE_ROOT_DEPARTMENT)
      .map((department) => department.id),
  );
  const allowedIds = new Set(
    departments
      .filter(
        (department) =>
          department.parentId !== null &&
          rootIds.has(department.parentId) &&
          PERFORMANCE_TEAM_NAMES.has(department.name),
      )
      .map((department) => department.id),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const department of departments) {
      if (
        department.parentId !== null &&
        allowedIds.has(department.parentId) &&
        !allowedIds.has(department.id)
      ) {
        allowedIds.add(department.id);
        changed = true;
      }
    }
  }

  return allowedIds;
}

export function belongsToPerformanceDepartment(
  departmentIds: string[],
  allowedDepartmentIds: Set<string>,
): boolean {
  return departmentIds.some((departmentId) => allowedDepartmentIds.has(departmentId));
}
