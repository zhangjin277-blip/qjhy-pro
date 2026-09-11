"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImageUp, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCourseExam, removeExam, saveCourse, saveExam } from "@/modules/course-center";
import type { CourseChapter, CourseInput, CourseItem, ExamQuestion } from "@/modules/course-center";
import { categoryOptions, stageOptions, typeOptions } from "./course-options";

const emptyCourse: CourseInput = {
  title: "",
  description: "",
  category: categoryOptions[0] ?? "其他产品",
  categories: [categoryOptions[0] ?? "其他产品"],
  type: "video",
  stage: "beginner",
  durationMin: 30,
  coverPath: "",
  videoUrl: "",
  instructor: "",
  content: "",
  chapters: [],
};

export function CourseEditor({
  open,
  course,
  canUpload,
  canManageExam,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  course: CourseItem | null;
  canUpload: boolean;
  canManageExam: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<CourseInput>(emptyCourse);
  const [section, setSection] = useState<"basic" | "chapters" | "exam">("basic");
  const [examEnabled, setExamEnabled] = useState(false);
  const [passScore, setPassScore] = useState(60);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "video" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSection("basic");
    setDraft(
      course
        ? {
            id: course.id,
            title: course.title,
            description: course.description,
            category: course.category,
            categories: course.categories,
            type: course.type as CourseInput["type"],
            stage: course.stage as CourseInput["stage"],
            durationMin: course.durationMin,
            coverPath: course.coverPath,
            videoUrl: course.videoUrl,
            instructor: course.instructor,
            content: course.content,
            chapters: course.chapters,
          }
        : emptyCourse,
    );
    setExamEnabled(course?.hasExam ?? false);
    setQuestions([]);
    setPassScore(60);
    if (course?.hasExam && canManageExam) {
      getCourseExam(course.id)
        .then((exam) => {
          if (!exam) return;
          setQuestions(exam.questions);
          setPassScore(exam.passScore);
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "考试加载失败"));
    }
  }, [canManageExam, course, open]);

  const categories = draft.categories?.length ? draft.categories : [draft.category];
  const chapters = draft.chapters ?? [];

  function setCategories(next: string[]) {
    const safe = next.length ? next : [categoryOptions[0] ?? "其他产品"];
    setDraft({ ...draft, categories: safe, category: safe[0] ?? "其他产品" });
  }

  function updateChapter(index: number, patch: Partial<CourseChapter>) {
    setDraft({
      ...draft,
      chapters: chapters.map((x, i) => (i === index ? { ...x, ...patch } : x)),
    });
  }

  function moveQuestion(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    const current = next[index];
    const replacement = next[target];
    if (!current || !replacement) return;
    next[index] = replacement;
    next[target] = current;
    setQuestions(next);
  }

  function upload(kind: "cover" | "video", file?: File) {
    if (!file) return;
    setUploading(kind);
    setUploadProgress(0);
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/courses/upload");
    xhr.upload.onprogress = (event) =>
      event.lengthComputable && setUploadProgress(Math.round((event.loaded / event.total) * 100));
    xhr.onerror = () => {
      setUploading(null);
      toast.error("网络错误，上传失败");
    };
    xhr.onload = () => {
      setUploading(null);
      const body = JSON.parse(xhr.responseText || "{}") as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!body.ok || !body.url) return toast.error(body.error ?? "上传失败");
      setDraft((value) => ({ ...value, [kind === "cover" ? "coverPath" : "videoUrl"]: body.url }));
      toast.success(kind === "cover" ? "封面已上传" : "视频已上传");
    };
    xhr.send(data);
  }

  async function submit() {
    setSaving(true);
    try {
      const result = await saveCourse(draft);
      if (canManageExam) {
        if (examEnabled) await saveExam(result.id, questions, passScore);
        else if (course?.hasExam) await removeExam(result.id);
      }
      toast.success(course ? "课程已更新" : "课程已创建");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{course ? "编辑课程" : "新建课程"}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b">
          {(
            [
              ["basic", "基本信息"],
              ["chapters", "章节"],
              ...(canManageExam ? [["exam", "考试"]] : []),
            ] as [typeof section, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`border-b-2 px-4 py-2 text-sm ${section === key ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {section === "basic" && (
          <div className="grid gap-4 py-2">
            <Field label="课程标题">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="课程简介">
              <Textarea
                rows={3}
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="课程类型">
                <NativeSelect
                  value={draft.type}
                  onChange={(value) => setDraft({ ...draft, type: value as CourseInput["type"] })}
                  options={typeOptions.map((x) => [x.value, x.label])}
                />
              </Field>
              <Field label="课程阶段">
                <NativeSelect
                  value={draft.stage}
                  onChange={(value) => setDraft({ ...draft, stage: value as CourseInput["stage"] })}
                  options={stageOptions.map((x) => [x.value, x.label])}
                />
              </Field>
              <Field label="时长（分钟）">
                <Input
                  type="number"
                  min={0}
                  value={draft.durationMin ?? 0}
                  onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="课程分类">
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={categories.includes(option)}
                      onChange={(e) =>
                        setCategories(
                          e.target.checked
                            ? [...categories, option]
                            : categories.filter((x) => x !== option),
                        )
                      }
                    />
                    {option}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="讲师">
                <Input
                  value={draft.instructor ?? ""}
                  onChange={(e) => setDraft({ ...draft, instructor: e.target.value })}
                />
              </Field>
              <Field label="封面地址">
                <div className="flex gap-2">
                  <Input
                    value={draft.coverPath ?? ""}
                    onChange={(e) => setDraft({ ...draft, coverPath: e.target.value })}
                  />
                  {canUpload && (
                    <UploadButton
                      kind="cover"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      uploading={uploading}
                      progress={uploadProgress}
                      onFile={upload}
                      icon={<ImageUp className="size-4" />}
                    />
                  )}
                </div>
              </Field>
            </div>
            {(draft.type === "video" || draft.type === "live") && (
              <Field label="视频或直播地址">
                <div className="flex gap-2">
                  <Input
                    value={draft.videoUrl ?? ""}
                    placeholder="可填写外部链接或上传视频"
                    onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value })}
                  />
                  {canUpload && (
                    <UploadButton
                      kind="video"
                      accept="video/mp4,video/webm,video/quicktime,.avi,.mkv"
                      uploading={uploading}
                      progress={uploadProgress}
                      onFile={upload}
                      icon={<Video className="size-4" />}
                    />
                  )}
                </div>
              </Field>
            )}
            <Field label={draft.type === "article" ? "图文正文" : "课程正文"}>
              <Textarea
                rows={8}
                value={draft.content ?? ""}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </Field>
          </div>
        )}

        {section === "chapters" && (
          <div className="space-y-3 py-2">
            {chapters.map((chapter, index) => (
              <div key={chapter.id} className="grid gap-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">第 {index + 1} 章</span>
                  <Input
                    value={chapter.title}
                    placeholder="章节标题"
                    onChange={(e) => updateChapter(index, { title: e.target.value })}
                  />
                  <Input
                    className="w-28"
                    type="number"
                    min={0}
                    value={chapter.durationMin ?? 0}
                    onChange={(e) => updateChapter(index, { durationMin: Number(e.target.value) })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    title="删除章节"
                    onClick={() =>
                      setDraft({ ...draft, chapters: chapters.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Input
                  value={chapter.resourceUrl ?? ""}
                  placeholder="章节资源链接（可选）"
                  onChange={(e) => updateChapter(index, { resourceUrl: e.target.value })}
                />
                <Textarea
                  rows={3}
                  value={chapter.content ?? ""}
                  placeholder="章节说明"
                  onChange={(e) => updateChapter(index, { content: e.target.value })}
                />
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setDraft({
                  ...draft,
                  chapters: [
                    ...chapters,
                    { id: crypto.randomUUID(), title: `第 ${chapters.length + 1} 章` },
                  ],
                })
              }
            >
              <Plus className="mr-1 size-4" />
              添加章节
            </Button>
          </div>
        )}

        {section === "exam" && canManageExam && (
          <div className="space-y-4 py-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={examEnabled}
                onChange={(e) => setExamEnabled(e.target.checked)}
              />
              启用课程考试
            </label>
            {examEnabled && (
              <>
                <Field label="及格线">
                  <Input
                    className="w-32"
                    type="number"
                    min={0}
                    value={passScore}
                    onChange={(e) => setPassScore(Number(e.target.value))}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["choice", "选择题"],
                      ["fill", "填空题"],
                      ["essay", "问答题"],
                    ] as const
                  ).map(([type, label]) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      onClick={() => setQuestions([...questions, newQuestion(type)])}
                    >
                      <Plus className="mr-1 size-4" />
                      {label}
                    </Button>
                  ))}
                </div>
                {questions.map((question, index) => (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    index={index}
                    total={questions.length}
                    onChange={(next) =>
                      setQuestions(questions.map((x, i) => (i === index ? next : x)))
                    }
                    onMove={(delta) => moveQuestion(index, delta)}
                    onDelete={() => setQuestions(questions.filter((_, i) => i !== index))}
                  />
                ))}
                <p className="text-sm text-muted-foreground">
                  共 {questions.length} 题，满分 {questions.reduce((sum, x) => sum + x.score, 0)} 分
                </p>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={saving || !draft.title.trim() || uploading !== null} onClick={submit}>
            {saving ? "保存中..." : "保存课程"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function NativeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
function UploadButton({
  kind,
  accept,
  uploading,
  progress,
  onFile,
  icon,
}: {
  kind: "cover" | "video";
  accept: string;
  uploading: "cover" | "video" | null;
  progress: number;
  onFile: (kind: "cover" | "video", file?: File) => void;
  icon: React.ReactNode;
}) {
  return (
    <label
      className={`inline-flex h-9 cursor-pointer items-center justify-center rounded-md border px-3 text-sm ${uploading !== null ? "pointer-events-none opacity-50" : "hover:bg-muted"}`}
    >
      {uploading === kind ? `${progress}%` : icon}
      <span className="sr-only">上传</span>
      <input
        className="hidden"
        type="file"
        accept={accept}
        onChange={(e) => onFile(kind, e.target.files?.[0])}
      />
    </label>
  );
}
function newQuestion(type: ExamQuestion["type"]): ExamQuestion {
  return {
    id: crypto.randomUUID(),
    type,
    title: "",
    score: type === "essay" ? 0 : 10,
    options: type === "choice" ? ["选项 A", "选项 B"] : undefined,
    answer: type === "choice" ? "选项 A" : "",
  };
}
function QuestionEditor({
  question,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  question: ExamQuestion;
  index: number;
  total: number;
  onChange: (value: ExamQuestion) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const options = question.options ?? [];
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          第 {index + 1} 题 ·{" "}
          {question.type === "choice" ? "选择题" : question.type === "fill" ? "填空题" : "问答题"}
        </span>
        <span className="flex-1" />
        <Input
          className="w-24"
          type="number"
          min={0}
          value={question.score}
          onChange={(e) => onChange({ ...question, score: Number(e.target.value) })}
        />
        <Button
          size="icon"
          variant="ghost"
          disabled={index === 0}
          title="上移"
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={index === total - 1}
          title="下移"
          onClick={() => onMove(1)}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" title="删除题目" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      <Input
        value={question.title}
        placeholder="题目"
        onChange={(e) => onChange({ ...question, title: e.target.value })}
      />
      {question.type === "choice" && (
        <div className="space-y-2">
          {options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <input
                type="radio"
                checked={question.answer === option}
                onChange={() => onChange({ ...question, answer: option })}
              />
              <Input
                value={option}
                onChange={(e) => {
                  const next = [...options];
                  const wasAnswer = question.answer === option;
                  next[optionIndex] = e.target.value;
                  onChange({
                    ...question,
                    options: next,
                    answer: wasAnswer ? e.target.value : question.answer,
                  });
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                title="删除选项"
                disabled={options.length <= 2}
                onClick={() =>
                  onChange({
                    ...question,
                    options: options.filter((_, i) => i !== optionIndex),
                    answer:
                      question.answer === option
                        ? (options.find((_, i) => i !== optionIndex) ?? "")
                        : question.answer,
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...question,
                options: [...options, `选项 ${String.fromCharCode(65 + options.length)}`],
              })
            }
          >
            <Plus className="mr-1 size-4" />
            添加选项
          </Button>
        </div>
      )}
      {question.type === "fill" && (
        <Input
          value={question.answer ?? ""}
          placeholder="正确答案"
          onChange={(e) => onChange({ ...question, answer: e.target.value })}
        />
      )}
      {question.type === "essay" && (
        <p className="text-xs text-muted-foreground">问答题保留作答内容，不参与自动计分。</p>
      )}
    </div>
  );
}
