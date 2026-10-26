import { dbAll } from './runtime';

export async function getUserDepartmentLabels(db) {
    const users = await dbAll(db, `
        SELECT u.user_id, COALESCE(NULLIF(a.alias, ''), d.name) AS department_label
        FROM dingtalk_user u
        LEFT JOIN dingtalk_dept d ON d.dept_id = u.dept_ids->>0
        LEFT JOIN entity_alias a ON a.entity_type = 'dept' AND a.entity_id = d.dept_id
    `);
    return new Map(users.map(u => [u.user_id, u.department_label]));
}

export async function getDepartmentGroups(db) {
    return dbAll(db, `
        WITH RECURSIVE department_tree AS (
            SELECT d.dept_id, COALESCE(NULLIF(a.alias, ''), d.name) AS label,
                   COALESCE(NULLIF(a.alias, ''), d.name) AS path, 0 AS depth
            FROM dingtalk_dept d
            LEFT JOIN entity_alias a ON a.entity_type = 'dept' AND a.entity_id = d.dept_id
            WHERE d.parent_id = '1'
            UNION ALL
            SELECT d.dept_id, COALESCE(NULLIF(a.alias, ''), d.name),
                   parent.path || ' / ' || COALESCE(NULLIF(a.alias, ''), d.name), parent.depth + 1
            FROM dingtalk_dept d
            JOIN department_tree parent ON d.parent_id = parent.dept_id
            LEFT JOIN entity_alias a ON a.entity_type = 'dept' AND a.entity_id = d.dept_id
        )
        SELECT dept_id AS id, path AS name, label, depth FROM department_tree ORDER BY path
    `);
}

// 根据钉钉用户 ID 匹配部门树，不能用部门名称：组织架构中存在多个同名组。
export function appendDepartmentFilter(sql, params, deptId, userField = 'dingtalk_userid') {
    if (!deptId) return sql;
    params.push(deptId);
    return sql + ` AND ${userField} IN (
        WITH RECURSIVE selected_departments AS (
            SELECT dept_id FROM dingtalk_dept WHERE dept_id = ?
            UNION
            SELECT d.dept_id FROM dingtalk_dept d
            JOIN selected_departments parent ON d.parent_id = parent.dept_id
        )
        SELECT user_id FROM dingtalk_user
        WHERE dept_ids ?| ARRAY(SELECT dept_id FROM selected_departments)
    )`;
}
