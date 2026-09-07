"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Pencil, Plus, Save, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useProjectSharedState } from "@/hooks/use-project-shared-state";
import { cn } from "@/lib/utils/cn";
import {
  OFFICIAL_STAFF,
  type OfficialStaffRecord,
  type OfficialStaffStage,
} from "../_data/project-roster";

const PROFILE_KEY = "zhaohua-official-anchor-profiles-v1";
const PHOTO_DB = "zhaohua-official-anchor-media";
const PHOTO_STORE = "anchor-photos";
const STAFF_KEY = "zhaohua-official-staff-v1";

interface AnchorProfile {
  positioning: string;
  gameSpecialty: string;
  gameFamiliarity: string;
  cameraPerformance: string;
  interactionAbility: string;
  danceProgress: string;
  trainingFocus: string;
  strengths: string;
  improvements: string;
  notes: string;
}

interface AnchorPhoto {
  id: string;
  name: string;
  url: string;
}

interface LegacyAnchorPhoto {
  id: string;
  name: string;
  dataUrl: string;
}

const EMPTY_PROFILE: AnchorProfile = {
  positioning: "",
  gameSpecialty: "",
  gameFamiliarity: "待评估",
  cameraPerformance: "待评估",
  interactionAbility: "待评估",
  danceProgress: "未开始",
  trainingFocus: "",
  strengths: "",
  improvements: "",
  notes: "",
};

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE, { keyPath: "anchorName" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadLegacyPhotos(anchorName: string): Promise<LegacyAnchorPhoto[]> {
  const database = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE, "readonly");
    const request = transaction.objectStore(PHOTO_STORE).get(anchorName);
    request.onsuccess = () => {
      const result = request.result as { photos?: LegacyAnchorPhoto[] } | undefined;
      resolve(result?.photos ?? []);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

function mediaUrl(anchorName: string, file?: string): string {
  const base = `/api/projects/zhaohua/anchor-media/${encodeURIComponent(anchorName)}`;
  return file ? `${base}?file=${encodeURIComponent(file)}` : base;
}

async function fetchPhotos(anchorName: string): Promise<AnchorPhoto[]> {
  const response = await fetch(mediaUrl(anchorName), { cache: "no-store" });
  if (!response.ok) throw new Error("照片加载失败");
  const { files } = (await response.json()) as { files: string[] };
  return files.map((file) => ({ id: file, name: file, url: mediaUrl(anchorName, file) }));
}

async function postPhoto(anchorName: string, file: File | Blob): Promise<void> {
  const form = new FormData();
  form.set("file", file, file instanceof File ? file.name : "legacy.jpg");
  const response = await fetch(mediaUrl(anchorName), { method: "POST", body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "照片保存失败");
  }
}

function ratingSelectClass(): string {
  return "h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
}

function AnchorProfileDrawer({
  anchor,
  onOpenChange,
}: {
  anchor: OfficialStaffRecord | null;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<AnchorProfile>(EMPTY_PROFILE);
  const [photos, setPhotos] = useState<AnchorPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const profilesRef = useRef<Record<string, AnchorProfile>>({});
  const {
    value: profiles,
    update: updateProfiles,
    ready: profilesReady,
    saving: profileSaving,
    error: profileError,
  } = useProjectSharedState<Record<string, AnchorProfile>>({
    projectKey: "zhaohua",
    stateKey: "official_anchor_profiles",
    initialValue: {},
    localStorageKey: PROFILE_KEY,
  });
  profilesRef.current = profiles;

  useEffect(() => {
    if (!anchor || !profilesReady) return;
    setProfile({ ...EMPTY_PROFILE, ...profilesRef.current[anchor.name] });
    setSaved(false);
    setPhotoError(null);
    fetchPhotos(anchor.name)
      .then(async (serverPhotos) => {
        if (serverPhotos.length > 0) return serverPhotos;
        const legacy = await loadLegacyPhotos(anchor.name).catch(() => []);
        for (const photo of legacy.slice(0, 3)) {
          const blob = await fetch(photo.dataUrl).then((response) => response.blob());
          await postPhoto(anchor.name, blob);
        }
        return legacy.length > 0 ? fetchPhotos(anchor.name) : [];
      })
      .then(setPhotos)
      .catch(() => {
        setPhotos([]);
        setPhotoError("照片存储暂不可用");
      });
  }, [anchor, profilesReady]);

  const updateProfile = (patch: Partial<AnchorProfile>) => {
    setProfile((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const saveProfile = async () => {
    if (!anchor) return;
    const anchorName = anchor.name;
    const savedToServer = await updateProfiles((current) => ({
      ...current,
      [anchorName]: profile,
    }));
    setSaved(savedToServer);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!anchor || !files) return;
    const available = 3 - photos.length;
    const selected = Array.from(files).slice(0, available);
    if (selected.length === 0) {
      setPhotoError("最多上传 3 张照片");
      return;
    }
    if (selected.some((file) => !file.type.startsWith("image/"))) {
      setPhotoError("请选择图片文件");
      return;
    }
    if (selected.some((file) => file.size > 8 * 1024 * 1024)) {
      setPhotoError("单张照片不能超过 8MB");
      return;
    }
    try {
      for (const file of selected) await postPhoto(anchor.name, file);
      setPhotos(await fetchPhotos(anchor.name));
      setPhotoError(null);
    } catch {
      setPhotoError("照片保存失败，请重试");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePhoto = async (photoId: string) => {
    if (!anchor) return;
    try {
      const response = await fetch(`${mediaUrl(anchor.name)}?file=${encodeURIComponent(photoId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("照片删除失败");
      setPhotos(await fetchPhotos(anchor.name));
    } catch {
      setPhotoError("照片删除失败，请重试");
    }
  };

  const ratingFields: {
    label: string;
    key: "gameFamiliarity" | "cameraPerformance" | "interactionAbility" | "danceProgress";
    options: string[];
  }[] = [
    { label: "游戏熟悉度", key: "gameFamiliarity", options: ["待评估", "入门", "熟悉", "熟练"] },
    { label: "镜头表现", key: "cameraPerformance", options: ["待评估", "需训练", "稳定", "突出"] },
    { label: "互动能力", key: "interactionAbility", options: ["待评估", "需训练", "稳定", "突出"] },
    { label: "舞蹈学习", key: "danceProgress", options: ["未开始", "学习中", "可展示", "熟练"] },
  ];

  return (
    <Sheet open={anchor !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[620px] !max-w-[96vw] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">{anchor?.name ?? "主播"}档案</SheetTitle>
        <SheetDescription className="sr-only">
          官号主播形象资料、能力评估与训练记录
        </SheetDescription>
        {anchor ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-500">官号主播档案</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                  {(anchor.alias ?? anchor.name).slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">
                    {anchor.alias ?? anchor.name}
                    {anchor.alias ? (
                      <span className="ml-2 text-sm font-normal text-slate-500">{anchor.name}</span>
                    ) : null}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{anchor.responsibility}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5",
                        anchor.stage === "在播"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700",
                      )}
                    >
                      {anchor.stage}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">形象资料</h4>
                    <p className="mt-0.5 text-xs text-slate-500">上传 2–3 张形象照或定妆照</p>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => void uploadPhotos(event.target.files)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={photos.length >= 3}
                    onClick={() => inputRef.current?.click()}
                  >
                    <ImagePlus />
                    上传照片
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="group relative aspect-[3/4] overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.name} className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => void removePhoto(photo.id)}
                        className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm hover:text-red-600"
                        title="删除照片"
                        aria-label={`删除 ${photo.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - photos.length) }).map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="flex aspect-[3/4] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600"
                    >
                      <Camera className="mb-2 size-5" />
                      {photos.length + index === 0 ? "形象照" : "定妆照"}
                    </button>
                  ))}
                </div>
                {photoError ? <p className="mt-2 text-xs text-red-600">{photoError}</p> : null}
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-900">主播定位</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                    直播人设 / 风格
                    <Input
                      value={profile.positioning}
                      onChange={(event) => updateProfile({ positioning: event.target.value })}
                      placeholder="例如：活力陪伴型"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                    擅长角色 / 玩法
                    <Input
                      value={profile.gameSpecialty}
                      onChange={(event) => updateProfile({ gameSpecialty: event.target.value })}
                      placeholder="记录熟悉的游戏内容"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-900">能力评估</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ratingFields.map((field) => (
                    <label
                      key={field.key}
                      className="grid gap-1.5 text-xs font-medium text-slate-600"
                    >
                      {field.label}
                      <select
                        value={profile[field.key]}
                        onChange={(event) => updateProfile({ [field.key]: event.target.value })}
                        className={ratingSelectClass()}
                      >
                        {field.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold text-slate-900">训练与跟进</h4>
                <div className="grid gap-3">
                  {(
                    [
                      ["trainingFocus", "当前训练重点", "例如：熟悉玩法、开场话术、舞蹈动作"],
                      ["strengths", "当前优势", "记录稳定表现和可放大的特点"],
                      ["improvements", "待改进", "记录下一阶段需解决的问题"],
                      ["notes", "补充备注", "其他培养、排班或形象要求"],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <label key={key} className="grid gap-1.5 text-xs font-medium text-slate-600">
                      {label}
                      <Textarea
                        value={profile[key]}
                        onChange={(event) => updateProfile({ [key]: event.target.value })}
                        placeholder={placeholder}
                        className="min-h-20 resize-y"
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
              <span className="text-xs text-slate-500">
                {profileError
                  ? profileError
                  : profileSaving
                    ? "正在同步"
                    : saved
                      ? "档案已同步"
                      : "修改后请保存"}
              </span>
              <Button type="button" onClick={() => void saveProfile()} disabled={profileSaving}>
                <Save />
                保存档案
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function OfficialAnchorRoster(): React.JSX.Element {
  const [selectedAnchor, setSelectedAnchor] = useState<OfficialStaffRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const {
    value: staff,
    update: updateStaff,
    ready,
    saving,
    error,
  } = useProjectSharedState<OfficialStaffRecord[]>({
    projectKey: "zhaohua",
    stateKey: "official_staff",
    initialValue: OFFICIAL_STAFF,
    localStorageKey: STAFF_KEY,
  });
  const anchors = staff.filter((person) => person.role === "主播");
  const support = staff.filter((person) => person.role !== "主播");
  const operators = support.filter((person) => person.role.startsWith("运营")).length;
  const controllers = support.filter((person) => person.role === "场控").length;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-900">
          <UsersRound className="size-4 text-slate-400" />
          人员
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            主播 {anchors.length} · 运营 {operators} · 场控 {controllers}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            disabled={!ready}
          >
            <Pencil />
            编辑人员
          </Button>
        </div>
      </div>
      <div className="p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {anchors.map((anchor) => (
            <button
              key={anchor.name}
              type="button"
              onClick={() => setSelectedAnchor(anchor)}
              className="flex min-w-0 items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {(anchor.alias ?? anchor.name).slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {anchor.alias ?? anchor.name}
                </span>
                <span className="block truncate text-[11px] text-slate-400">
                  {anchor.alias ? anchor.name : anchor.responsibility}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                  anchor.stage === "在播"
                    ? "bg-emerald-50 text-emerald-700"
                    : anchor.stage === "离职"
                      ? "bg-slate-100 text-slate-500"
                      : "bg-amber-50 text-amber-700",
                )}
              >
                {anchor.stage}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">直播支持</span>
            <span className="text-slate-400">{support.length} 人</span>
          </div>
          <div className="space-y-2">
            {support.map((person) => (
              <div
                key={`${person.name}-${person.role}`}
                className="grid grid-cols-[70px_72px_minmax(0,1fr)] gap-2 border-b border-slate-100 py-2 text-xs last:border-b-0"
              >
                <span className="font-medium text-slate-700">{person.name}</span>
                <span className="text-slate-500">{person.role}</span>
                <span className="truncate text-slate-400" title={person.responsibility}>
                  {person.responsibility}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnchorProfileDrawer
        anchor={selectedAnchor}
        onOpenChange={(open) => {
          if (!open) setSelectedAnchor(null);
        }}
      />
      <OfficialStaffEditor
        open={editing}
        staff={staff}
        saving={saving}
        error={error}
        onOpenChange={setEditing}
        onSave={async (next) => {
          const ok = await updateStaff(() => next);
          if (ok) setEditing(false);
          return ok;
        }}
      />
    </section>
  );
}

function OfficialStaffEditor({
  open,
  staff,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  staff: OfficialStaffRecord[];
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (next: OfficialStaffRecord[]) => Promise<boolean>;
}): React.JSX.Element {
  const [draft, setDraft] = useState<OfficialStaffRecord[]>(staff);
  useEffect(() => {
    if (open) setDraft(staff.map((person) => ({ ...person })));
  }, [open, staff]);
  const patch = (index: number, value: Partial<OfficialStaffRecord>) =>
    setDraft((current) =>
      current.map((person, i) => (i === index ? { ...person, ...value } : person)),
    );
  const add = () =>
    setDraft((current) => [
      ...current,
      { name: "", alias: null, role: "主播", stage: "培训中", responsibility: "" },
    ]);
  const remove = (index: number) => setDraft((current) => current.filter((_, i) => i !== index));
  const save = () => {
    const clean = draft.map((person) => ({
      ...person,
      name: person.name.trim(),
      alias: person.alias?.trim() || null,
      responsibility: person.responsibility.trim() || "官号直播主播",
    }));
    if (clean.some((person) => !person.name)) return;
    void onSave(clean);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[680px] !max-w-[96vw] overflow-y-auto">
        <SheetTitle>编辑官号直播人员</SheetTitle>
        <SheetDescription>增减主播、调整运营和场控，保存后排班选择会同步更新。</SheetDescription>
        <div className="mt-5 space-y-3">
          {draft.map((person, index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={person.name}
                  onChange={(e) => patch(index, { name: e.target.value })}
                  placeholder="姓名"
                />
                <Input
                  value={person.alias ?? ""}
                  onChange={(e) => patch(index, { alias: e.target.value || null })}
                  placeholder="抖音昵称 / 别名"
                />
                <select
                  value={person.role}
                  onChange={(e) =>
                    patch(index, { role: e.target.value as OfficialStaffRecord["role"] })
                  }
                  className={ratingSelectClass()}
                >
                  <option>主播</option>
                  <option>场控</option>
                  <option>运营</option>
                  <option>运营（实习生）</option>
                </select>
                <select
                  value={person.stage}
                  onChange={(e) => patch(index, { stage: e.target.value as OfficialStaffStage })}
                  className={ratingSelectClass()}
                >
                  <option>在播</option>
                  <option>在岗</option>
                  <option>培训中</option>
                  <option>离职</option>
                </select>
                <Input
                  value={person.responsibility}
                  onChange={(e) => patch(index, { responsibility: e.target.value })}
                  placeholder="职责说明"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2 text-red-600"
                onClick={() => remove(index)}
              >
                <Trash2 />
                移除人员
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" className="mt-4" onClick={add}>
          <Plus />
          新增人员
        </Button>
        {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "同步中" : "保存并同步"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
