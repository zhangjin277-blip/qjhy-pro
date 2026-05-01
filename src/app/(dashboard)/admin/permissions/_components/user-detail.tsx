"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setDeptLeader, removeDeptLeader, upsertOverride, type Scope } from "@/modules/permissions";

const SCOPE_LABEL: Record<Scope, string> = {
  none: "无权限",
  self: "仅本人",
  team: "本部门",
  all: "全部",
};

const SOURCE_LABEL: Record<string, string> = {
  default: "岗位默认",
  dept_leader: "部门负责人",
  override: "个体覆盖",
};

interface UserDetail {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  permission: {
    scope: Scope;
    can_edit: boolean;
    can_export: boolean;
    can_admin: boolean;
    sources: { kind: string; [k: string]: unknown }[];
  };
  managedDepts: { dept_id: string; name: string }[];
}

export function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [overrideScope, setOverrideScope] = useState<Scope | "">("");
  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [newDeptId, setNewDeptId] = useState("");

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [userId]);

  if (!detail) return <p className="text-muted-foreground">加载中...</p>;

  async function handleAddDeptLeader() {
    if (!newDeptId.trim()) {
      alert("请输入 dept_id");
      return;
    }
    try {
      await setDeptLeader({ dept_id: newDeptId.trim(), user_id: userId });
      setAddDeptOpen(false);
      setNewDeptId("");
      location.reload();
    } catch (e) {
      alert("操作失败：" + (e instanceof Error ? e.message : "未知错误"));
    }
  }

  async function handleRemoveDeptLeader(deptId: string) {
    if (!confirm(`确认移除负责的部门 ${deptId}？`)) return;
    try {
      await removeDeptLeader({ dept_id: deptId, user_id: userId });
      location.reload();
    } catch (e) {
      alert("操作失败：" + (e instanceof Error ? e.message : "未知错误"));
    }
  }

  async function handleSubmitOverride() {
    if (!reason.trim()) {
      alert("必须填变更理由");
      return;
    }
    try {
      await upsertOverride({
        user_id: userId,
        scope: overrideScope || undefined,
        reason: reason.trim(),
      });
      setOverrideOpen(false);
      setReason("");
      setOverrideScope("");
      location.reload();
    } catch (e) {
      alert("操作失败：" + (e instanceof Error ? e.message : "未知错误"));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{detail.name}</CardTitle>
          <div className="text-xs text-muted-foreground">
            {detail.title ?? "未填岗位"} · 来自钉钉同步（不可改）
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            最终生效权限：数据范围=
            <strong>{SCOPE_LABEL[detail.permission.scope]}</strong>， 可编辑=
            {detail.permission.can_edit ? "是" : "否"}，可导出=
            {detail.permission.can_export ? "是" : "否"}，可管理=
            {detail.permission.can_admin ? "是" : "否"}
          </div>
          <div>
            权限来源：
            {detail.permission.sources.map((s) => SOURCE_LABEL[s.kind] ?? s.kind).join(" + ") ||
              "无"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">团队负责人设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {detail.managedDepts.length === 0 ? (
            <p className="text-sm text-muted-foreground">未管理任何部门</p>
          ) : (
            <ul className="space-y-1">
              {detail.managedDepts.map((d) => (
                <li key={d.dept_id} className="flex items-center justify-between text-sm">
                  <span>
                    {d.name} <code className="text-xs text-muted-foreground">({d.dept_id})</code>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveDeptLeader(d.dept_id)}
                  >
                    移除
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Dialog open={addDeptOpen} onOpenChange={setAddDeptOpen}>
            <DialogTrigger
              render={
                <Button size="sm" variant="outline">
                  添加管理部门
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加部门</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                MVP 简化：直接输入钉钉部门 dept_id（数字字符串）。
              </p>
              <Input
                placeholder="例如 1071560406"
                value={newDeptId}
                onChange={(e) => setNewDeptId(e.target.value)}
              />
              <DialogFooter>
                <Button onClick={handleAddDeptLeader}>确认添加</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">个体权限覆盖</CardTitle>
        </CardHeader>
        <CardContent>
          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  编辑覆盖
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>编辑权限覆盖</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>数据范围（可选，留空则不覆盖）</Label>
                  <Select value={overrideScope} onValueChange={(v) => setOverrideScope(v as Scope)}>
                    <SelectTrigger>
                      <SelectValue placeholder="不覆盖" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无权限（看不到数据）</SelectItem>
                      <SelectItem value="self">仅本人</SelectItem>
                      <SelectItem value="team">本部门</SelectItem>
                      <SelectItem value="all">全部</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>变更理由（必填）</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="例：临时给该运营开 TEAM 范围用于 X 项目"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSubmitOverride}>保存</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
