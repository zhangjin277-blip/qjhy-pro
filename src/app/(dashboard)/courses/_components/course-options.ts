import { BookOpen, FolderOpen, Radio, Video } from "lucide-react";

export const categoryOptions = [
  "途游斗地主",
  "捕鱼大作战",
  "途游休闲捕鱼",
  "3D捕鱼",
  "三国:冰河时代",
  "其他产品",
];
export const typeOptions = [
  { value: "collection", label: "合辑课", icon: FolderOpen },
  { value: "video", label: "视频课", icon: Video },
  { value: "article", label: "图文课", icon: BookOpen },
  { value: "live", label: "直播课", icon: Radio },
] as const;
export const stageOptions = [
  { value: "beginner", label: "新手学园" },
  { value: "growth", label: "成长学园" },
  { value: "advanced", label: "进阶学园" },
  { value: "general", label: "通识学园" },
] as const;
export const stageLabel = (value: string) =>
  stageOptions.find((x) => x.value === value)?.label ?? value;
export const typeLabel = (value: string) =>
  typeOptions.find((x) => x.value === value)?.label ?? value;
export const mediaUrl = (path: string | null | undefined) =>
  path?.startsWith("/uploads/courses/")
    ? `/api/courses/media?path=${encodeURIComponent(path)}`
    : path || null;
