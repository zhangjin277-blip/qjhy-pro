"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "./users-tab";
import { RoleDefaultsTab } from "./role-defaults-tab";
import { AuditLogTab } from "./audit-log-tab";

type TabValue = "users" | "roles" | "audit";

export function PermissionsTabs() {
  const [tab, setTab] = useState<TabValue>("users");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
      <TabsList>
        <TabsTrigger value="users">按用户管理</TabsTrigger>
        <TabsTrigger value="roles">岗位默认权限</TabsTrigger>
        <TabsTrigger value="audit">审计日志</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <UsersTab />
      </TabsContent>
      <TabsContent value="roles">
        <RoleDefaultsTab />
      </TabsContent>
      <TabsContent value="audit">
        <AuditLogTab />
      </TabsContent>
    </Tabs>
  );
}
