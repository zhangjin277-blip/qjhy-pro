import { createRouter, passThrough, dbAll, dbGet, dbRun, getNow } from './runtime';
export default function(db) {
 const router = createRouter(); const authenticateToken = passThrough;
    router.post('/my-status', authenticateToken, async (req, res) => {
        try {
            const currentUser = req.user;
            const { date, status, remark, target_user_id, target_anchor_name } = req.body;

            if (!date || !status) {
                return res.status(400).json({ success: false, msg: '日期和状态为必填项' });
            }

            const validStatuses = ['normal', 'training', 'cannot_stream', 'rest'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ success: false, msg: '无效的状态值，可选: normal/training/leave/rest' });
            }

            const now = getNow();
            const isTeamLeader = currentUser.role === 'team_leader' || currentUser.role === 'admin';

            // 确定被标记的主播
            let targetUserId, targetUserName;
            if (target_user_id && target_user_id !== currentUser.id) {
                // 运营或负责人代标记（有 user_id）
                const targetUser = await dbGet(db, `SELECT id, name FROM users WHERE id = ?`, [target_user_id]);
                if (!targetUser) {
                    return res.status(404).json({ success: false, msg: '目标用户不存在' });
                }
                targetUserId = targetUser.id;
                targetUserName = targetUser.name;
            } else if (target_anchor_name && target_anchor_name !== currentUser.name) {
                // 运营代标记（主播在 users 表无账号，用名字匹配）
                const targetUser = await dbGet(db, `SELECT id, name FROM users WHERE name = ?`, [target_anchor_name]);
                if (targetUser) {
                    targetUserId = targetUser.id;
                    targetUserName = targetUser.name;
                } else {
                    // 主播没有系统账号，用 anchors 表 id 作为 user_id 的替代（负数避免冲突）
                    const anchor = await dbGet(db, `SELECT id FROM anchors WHERE name = ?`, [target_anchor_name]);
                    targetUserId = anchor ? -(anchor.id) : -Date.now();
                    targetUserName = target_anchor_name;
                }
            } else {
                // 主播自己标记
                targetUserId = currentUser.id;
                targetUserName = currentUser.name;
            }

            const isSelfMark = targetUserId === currentUser.id;

            // 检查是否已有生效的标记（已通过的），如有则需要走审核修改
            const existing = await dbGet(db,
                `SELECT * FROM anchor_daily_status WHERE user_id = ? AND date = ?`,
                [targetUserId, date]
            );

            let approvalStatus, approverRole;

            if (isSelfMark) {
                // 主播自己标记：待运营审核
                approvalStatus = 'pending';
                approverRole = 'operator';
            } else {
                // 运营/团队负责人/管理员代标记：直接生效
                approvalStatus = 'approved';
                approverRole = '';
            }

            // 如果已有 pending 状态的记录，先覆盖
            await dbRun(db,
                `INSERT INTO anchor_daily_status (user_id, user_name, date, status, remark, marked_by, approval_status, approver_role, approved_by, approved_at, reject_reason, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
                 ON CONFLICT(user_id, date) DO UPDATE SET
                    status = excluded.status,
                    remark = excluded.remark,
                    marked_by = excluded.marked_by,
                    approval_status = excluded.approval_status,
                    approver_role = excluded.approver_role,
                    approved_by = excluded.approved_by,
                    approved_at = excluded.approved_at,
                    reject_reason = '',
                    updated_at = excluded.updated_at`,
                [
                    targetUserId, targetUserName, date, status, remark || '',
                    currentUser.name,
                    approvalStatus, approverRole,
                    approvalStatus === 'approved' ? currentUser.name : '',
                    approvalStatus === 'approved' ? now : '',
                    now, now
                ]
            );

            // 如果直接生效，同步到 anchor_attendance_notes（兼容考勤导出）
            if (approvalStatus === 'approved' && (status === 'cannot_stream' || status === 'training')) {
                const noteType = status; // cannot_stream 或 training
                const existingNote = await dbGet(db,
                    `SELECT id FROM anchor_attendance_notes WHERE anchor_name = ? AND note_date = ? AND note_type = ?`,
                    [targetUserName, date, noteType]
                );
                if (existingNote) {
                    await dbRun(db,
                        `UPDATE anchor_attendance_notes SET content = ?, created_by = ?, created_at = ? WHERE id = ?`,
                        [remark || noteType, currentUser.name, now, existingNote.id]
                    );
                } else {
                    await dbRun(db,
                        `INSERT INTO anchor_attendance_notes (anchor_name, note_date, note_type, content, created_by, created_at) VALUES (?,?,?,?,?,?)`,
                        [targetUserName, date, noteType, remark || noteType, currentUser.name, now]
                    );
                }
            }
            // 如果状态改回 normal，清除对应的 notes
            if (approvalStatus === 'approved' && status === 'normal') {
                await dbRun(db,
                    `DELETE FROM anchor_attendance_notes WHERE anchor_name = ? AND note_date = ? AND note_type IN ('cannot_stream', 'training')`,
                    [targetUserName, date]
                );
            }

            const msg = approvalStatus === 'approved' ? '状态标记成功（已生效）' :
                        '状态标记已提交，等待运营审核';

            res.json({ success: true, msg });
        } catch (err) {
            console.error('[主播工作台] 标记每日状态失败:', err);
            res.status(500).json({ success: false, msg: '标记每日状态失败: ' + err.message });
        }
    });
    router.get('/pending-reviews', authenticateToken, async (req, res) => {
        try {
            const reviews = await dbAll(db, `SELECT s.*, a.operator_id, a.project, u_op.name AS operator_name FROM anchor_daily_status s LEFT JOIN anchors a ON a.name=s.user_name LEFT JOIN users u_op ON a.operator_id=u_op.id WHERE s.approval_status='pending' ORDER BY s.updated_at DESC`);
            res.json({ success: true, data: reviews });
        } catch (err) {
            console.error('[主播工作台] 获取待审核列表失败:', err);
            res.status(500).json({ success: false, msg: '获取待审核列表失败: ' + err.message });
        }
    });
    router.post('/review-status', authenticateToken, async (req, res) => {
        try {
            const currentUser = req.user;
            const { id, action, reject_reason } = req.body;

            if (!id || !['approve', 'reject'].includes(action)) {
                return res.status(400).json({ success: false, msg: '参数不完整' });
            }

            const record = await dbGet(db,
                `SELECT * FROM anchor_daily_status WHERE id = ?`,
                [id]
            );
            if (!record) {
                return res.status(404).json({ success: false, msg: '记录不存在' });
            }
            if (record.approval_status !== 'pending') {
                return res.status(400).json({ success: false, msg: '该记录不是待审核状态' });
            }

            const now = getNow();

            if (action === 'approve') {
                await dbRun(db,
                    `UPDATE anchor_daily_status SET approval_status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
                    [currentUser.name, now, now, id]
                );
                // 同步到 anchor_attendance_notes（兼容考勤导出）
                if (record.status === 'cannot_stream' || record.status === 'training') {
                    const existingNote = await dbGet(db,
                        `SELECT id FROM anchor_attendance_notes WHERE anchor_name = ? AND note_date = ? AND note_type = ?`,
                        [record.user_name, record.date, record.status]
                    );
                    if (!existingNote) {
                        await dbRun(db,
                            `INSERT INTO anchor_attendance_notes (anchor_name, note_date, note_type, content, created_by, created_at) VALUES (?,?,?,?,?,?)`,
                            [record.user_name, record.date, record.status, record.remark || record.status, currentUser.name, now]
                        );
                    }
                }
                if (record.status === 'normal') {
                    await dbRun(db,
                        `DELETE FROM anchor_attendance_notes WHERE anchor_name = ? AND note_date = ? AND note_type IN ('cannot_stream', 'training')`,
                        [record.user_name, record.date]
                    );
                }
                res.json({ success: true, msg: '已通过' });
            } else {
                await dbRun(db,
                    `UPDATE anchor_daily_status SET approval_status = 'rejected', approved_by = ?, approved_at = ?, reject_reason = ?, updated_at = ? WHERE id = ?`,
                    [currentUser.name, now, reject_reason || '', now, id]
                );
                res.json({ success: true, msg: '已拒绝' });
            }
        } catch (err) {
            console.error('[主播工作台] 审核状态标记失败:', err);
            res.status(500).json({ success: false, msg: '审核状态标记失败: ' + err.message });
        }
    });
 return router;
}
