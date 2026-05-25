"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "./users-tab";
import { RoleDefaultsTab } from "./role-defaults-tab";
import { AuditLogTab } from "./audit-log-tab";
import { DeptAliasesTab } from "./dept-aliases-tab";
import { InviteCodesTab } from "./invite-codes-tab";

type TabValue = "users" | "roles" | "dept-aliases" | "invite-codes" | "audit";

export function PermissionsTabs() {
  const [tab, setTab] = useState<TabValue>("users");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
      <TabsList>
        <TabsTrigger value="users">按用户管理</TabsTrigger>
        <TabsTrigger value="roles">岗位默认权限</TabsTrigger>
        <TabsTrigger value="dept-aliases">部门别名</TabsTrigger>
        <TabsTrigger value="invite-codes">邀请码</TabsTrigger>
        <TabsTrigger value="audit">审计日志</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <UsersTab />
      </TabsContent>
      <TabsContent value="roles">
        <RoleDefaultsTab />
      </TabsContent>
      <TabsContent value="dept-aliases">
        <DeptAliasesTab />
      </TabsContent>
      <TabsContent value="invite-codes">
        <InviteCodesTab />
      </TabsContent>
      <TabsContent value="audit">
        <AuditLogTab />
      </TabsContent>
    </Tabs>
  );
}
