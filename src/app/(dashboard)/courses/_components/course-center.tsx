"use client";

import { useRef, useState, useTransition } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  Heart,
  History,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  ThumbsUp,
  Trash2,
  Trophy,
  GraduationCap,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  completeCourse,
  deleteCourse,
  fetchCourses,
  getCourseExam,
  getPersonalLearning,
  recordCourseView,
  submitCourseExam,
  toggleCourseFavorite,
  toggleCourseLike,
} from "@/modules/course-center";
import type {
  CourseItem,
  CourseStats,
  ExamPayload,
  ExamResult,
  MyTrainingItem,
} from "@/modules/course-center";
import { CourseEditor } from "./course-editor";
import {
  categoryOptions,
  mediaUrl,
  stageLabel,
  stageOptions,
  typeLabel,
  typeOptions,
} from "./course-options";

interface FilterState {
  keyword: string;
  category: string;
  type: string;
  stage: string;
  learningStatus: "all" | "not_started" | "in_progress" | "completed";
  sort: "latest" | "popular" | "liked";
  page: number;
}
const initialFilter: FilterState = {
  keyword: "",
  category: "all",
  type: "all",
  stage: "all",
  learningStatus: "all",
  sort: "latest",
  page: 1,
};

export function CourseCenter({
  initialItems,
  initialTotal,
  capabilities,
  stats,
}: {
  initialItems: CourseItem[];
  initialTotal: number;
  capabilities: {
    edit: boolean;
    upload: boolean;
    delete: boolean;
    exam: boolean;
    stats: boolean;
    personal: boolean;
  };
  stats: CourseStats;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<FilterState>(initialFilter);
  const [view, setView] = useState<"catalog" | "personal">("catalog");
  const [personal, setPersonal] = useState<{
    favorites: CourseItem[];
    history: CourseItem[];
    training: MyTrainingItem[];
  } | null>(null);
  const [personalTab, setPersonalTab] = useState<"training" | "ranking" | "favorites" | "history">(
    "training",
  );
  const [rankingType, setRankingType] = useState<"week" | "total">("total");
  const [selected, setSelected] = useState<CourseItem | null>(null);
  const [editing, setEditing] = useState<CourseItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<CourseItem | null>(null);
  const [pending, startTransition] = useTransition();
  const requestVersion = useRef(0);
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "操作失败");
      }
    });
  }

  function reload(next: Partial<FilterState> = {}) {
    const value = { ...filters, ...next };
    const version = ++requestVersion.current;
    setFilters(value);
    run(async () => {
      const result = await fetchCourses({ ...value, pageSize });
      if (version !== requestVersion.current) return;
      setItems(result.items);
      setTotal(result.total);
    });
  }

  function openCourse(item: CourseItem) {
    setSelected(item);
    run(async () => {
      await recordCourseView(item.id);
      setItems((current) =>
        current.map((x) =>
          x.id === item.id
            ? {
                ...x,
                views: x.views + 1,
                progress:
                  capabilities.personal && x.progress === "not_started"
                    ? "in_progress"
                    : x.progress,
              }
            : x,
        ),
      );
      setSelected((current) =>
        current?.id === item.id
          ? {
              ...current,
              views: current.views + 1,
              progress:
                capabilities.personal && current.progress === "not_started"
                  ? "in_progress"
                  : current.progress,
            }
          : current,
      );
    });
  }

  function openPersonal() {
    setView("personal");
    run(async () => setPersonal(await getPersonalLearning()));
  }

  return (
    <main className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-sm text-muted-foreground">学习与培训</p>
          <h1 className="text-2xl font-semibold">课程中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">课程学习、考试与个人学习记录</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === "catalog" ? "default" : "outline"}
            onClick={() => setView("catalog")}
          >
            <BookOpen className="mr-1 size-4" />
            课程库
          </Button>
          <Button variant={view === "personal" ? "default" : "outline"} onClick={openPersonal}>
            <UserRound className="mr-1 size-4" />
            个人中心
          </Button>
          {capabilities.edit && (
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="mr-1 size-4" />
              新建课程
            </Button>
          )}
        </div>
      </header>

      {view === "catalog" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="累计学习"
              value={`${stats.completedCourses} 门 · ${stats.totalMinutes} 分钟`}
            />
            <Metric label="近 7 天" value={`${stats.weekCourses} 门 · ${stats.weekMinutes} 分钟`} />
            <Metric label="课程总数" value={`${stats.totalCourses} 门`} />
          </section>
          <FilterBar filters={filters} pending={pending} onChange={reload} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>共 {total} 门课程</span>
            {pending && <span>加载中...</span>}
          </div>
          <CourseGrid
            items={items}
            capabilities={capabilities}
            onOpen={openCourse}
            onEdit={(item) => {
              setEditing(item);
              setEditorOpen(true);
            }}
            onDelete={setDeleting}
            onFavorite={(item) =>
              run(async () => {
                const result = await toggleCourseFavorite(item.id);
                setItems((current) =>
                  current.map((x) =>
                    x.id === item.id ? { ...x, favorited: result.favorited } : x,
                  ),
                );
              })
            }
          />
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            onPage={(page) => reload({ page })}
          />
        </>
      ) : (
        <PersonalCenter
          data={personal}
          stats={stats}
          tab={personalTab}
          rankingType={rankingType}
          onTab={setPersonalTab}
          onRankingType={setRankingType}
          onOpen={openCourse}
        />
      )}

      <CourseEditor
        open={editorOpen}
        course={editing}
        canUpload={capabilities.upload}
        canManageExam={capabilities.exam}
        onOpenChange={setEditorOpen}
        onSaved={() => reload({ page: 1 })}
      />
      <CourseDetail
        course={selected}
        personalTracking={capabilities.personal}
        onClose={() => setSelected(null)}
        onChange={(next) => {
          setSelected(next);
          setItems((current) => current.map((x) => (x.id === next.id ? next : x)));
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="删除课程"
        description={
          deleting ? `确定删除“${deleting.title}”吗？课程进度、收藏和考试数据也会一并删除。` : ""
        }
        confirmText="删除"
        variant="danger"
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() =>
          deleting &&
          run(async () => {
            await deleteCourse(deleting.id);
            toast.success("课程已删除");
            setDeleting(null);
            reload();
          })
        }
      />
    </main>
  );
}

function FilterBar({
  filters,
  pending,
  onChange,
}: {
  filters: FilterState;
  pending: boolean;
  onChange: (next: Partial<FilterState>) => void;
}) {
  return (
    <section className="space-y-3 border-y py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索课程标题或简介"
            value={filters.keyword}
            onChange={(e) => onChange({ keyword: e.target.value, page: 1 })}
          />
        </div>
        <Select
          value={filters.type}
          label="类型"
          options={[
            ["all", "全部类型"],
            ...typeOptions.map((x) => [x.value, x.label] as [string, string]),
          ]}
          onChange={(type) => onChange({ type, page: 1 })}
        />
        <Select
          value={filters.stage}
          label="阶段"
          options={[
            ["all", "全部阶段"],
            ...stageOptions.map((x) => [x.value, x.label] as [string, string]),
          ]}
          onChange={(stage) => onChange({ stage, page: 1 })}
        />
        <Select
          value={filters.sort}
          label="排序"
          options={[
            ["latest", "最新发布"],
            ["popular", "观看最多"],
            ["liked", "点赞最多"],
          ]}
          onChange={(sort) => onChange({ sort: sort as FilterState["sort"], page: 1 })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {["all", ...categoryOptions].map((category) => (
          <button
            disabled={pending}
            key={category}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs",
              filters.category === category
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
            onClick={() => onChange({ category, page: 1 })}
          >
            {category === "all" ? "全部分类" : category}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "全部状态"],
            ["not_started", "未学习"],
            ["in_progress", "学习中"],
            ["completed", "已完成"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs",
              filters.learningStatus === value && "border-primary bg-primary/5 text-primary",
            )}
            onClick={() => onChange({ learningStatus: value, page: 1 })}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function CourseGrid({
  items,
  capabilities,
  onOpen,
  onEdit,
  onDelete,
  onFavorite,
}: {
  items: CourseItem[];
  capabilities: { edit: boolean; delete: boolean; personal: boolean };
  onOpen: (item: CourseItem) => void;
  onEdit: (item: CourseItem) => void;
  onDelete: (item: CourseItem) => void;
  onFavorite: (item: CourseItem) => void;
}) {
  if (!items.length)
    return (
      <div className="border border-dashed py-16 text-center text-sm text-muted-foreground">
        暂无符合条件的课程
      </div>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.id} className="overflow-hidden rounded-md border bg-card">
          <button className="block aspect-[16/8] w-full bg-muted" onClick={() => onOpen(item)}>
            {item.coverPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(item.coverPath) ?? ""}
                alt={item.title}
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center">
                <BookOpen className="size-10 text-muted-foreground" />
              </span>
            )}
          </button>
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <button
                className="min-w-0 flex-1 text-left font-medium hover:text-primary"
                onClick={() => onOpen(item)}
              >
                {item.title}
              </button>
              {capabilities.personal && (
                <IconButton
                  label={item.favorited ? "取消收藏" : "收藏"}
                  onClick={() => onFavorite(item)}
                >
                  <Heart
                    className={cn("size-4", item.favorited && "fill-rose-500 text-rose-500")}
                  />
                </IconButton>
              )}
              {capabilities.edit && (
                <IconButton label="编辑课程" onClick={() => onEdit(item)}>
                  <Pencil className="size-4" />
                </IconButton>
              )}
              {capabilities.delete && (
                <IconButton label="删除课程" onClick={() => onDelete(item)}>
                  <Trash2 className="size-4 text-destructive" />
                </IconButton>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {item.categories.map((category) => (
                <span
                  key={category}
                  className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {category}
                </span>
              ))}
            </div>
            <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
              {item.description || "暂无课程简介"}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{typeLabel(item.type)}</span>
              <span>{stageLabel(item.stage)}</span>
              <span>
                <Clock3 className="mr-1 inline size-3" />
                {item.durationMin} 分钟
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>
                  <Eye className="mr-1 inline size-3" />
                  {item.views}
                </span>
                <span>
                  <ThumbsUp className="mr-1 inline size-3" />
                  {item.likes}
                </span>
              </div>
              <Status value={item.progress} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function CourseDetail({
  course,
  personalTracking,
  onClose,
  onChange,
}: {
  course: CourseItem | null;
  personalTracking: boolean;
  onClose: () => void;
  onChange: (course: CourseItem) => void;
}) {
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [pending, startTransition] = useTransition();
  if (!course) return null;
  const source = mediaUrl(course.videoUrl);
  const embed = embedUrl(course.videoUrl);
  const run = (task: () => Promise<void>) =>
    startTransition(async () => {
      try {
        await task();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "操作失败");
      }
    });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{course.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>{typeLabel(course.type)}</span>
          <span>{stageLabel(course.stage)}</span>
          <span>{course.durationMin} 分钟</span>
          {course.instructor && <span>讲师：{course.instructor}</span>}
        </div>
        {source && isLocalVideo(course.videoUrl) && (
          <video
            controls
            preload="metadata"
            poster={mediaUrl(course.coverPath) ?? undefined}
            className="aspect-video w-full bg-black"
            src={source}
          />
        )}
        {embed && (
          <iframe
            title={course.title}
            className="aspect-video w-full bg-black"
            src={embed}
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
          />
        )}
        {source && !embed && !isLocalVideo(course.videoUrl) && (
          <a
            href={source}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 border-l-2 border-primary px-3 py-2 text-sm text-primary"
          >
            <ExternalLink className="size-4" />
            在新窗口打开课程资源
          </a>
        )}
        <p className="whitespace-pre-wrap text-sm leading-6">
          {course.content || course.description || "暂无课程内容"}
        </p>
        {!!course.chapters.length && (
          <section className="space-y-2">
            <h3 className="font-medium">课程章节</h3>
            {course.chapters.map((chapter, index) => (
              <div key={chapter.id} className="rounded-md border p-3">
                <div className="flex justify-between text-sm font-medium">
                  <span>
                    {index + 1}. {chapter.title}
                  </span>
                  {chapter.durationMin ? (
                    <span className="text-muted-foreground">{chapter.durationMin} 分钟</span>
                  ) : null}
                </div>
                {chapter.content && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {chapter.content}
                  </p>
                )}
                {chapter.resourceUrl && (
                  <a
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary"
                    href={mediaUrl(chapter.resourceUrl) ?? chapter.resourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-3" />
                    打开章节资料
                  </a>
                )}
              </div>
            ))}
          </section>
        )}
        {course.hasExam && (
          <ExamArea
            exam={exam}
            answers={answers}
            result={result}
            pending={pending}
            onAnswer={(id, answer) => setAnswers({ ...answers, [id]: answer })}
            onLoad={() =>
              run(async () => {
                const value = await getCourseExam(course.id);
                setExam(value);
                setResult(value?.previous ?? null);
              })
            }
            onSubmit={() => run(async () => setResult(await submitCourseExam(course.id, answers)))}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          {personalTracking && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  run(async () => {
                    const value = await toggleCourseLike(course.id);
                    onChange({
                      ...course,
                      liked: value.liked,
                      likes: course.likes + (value.liked ? 1 : -1),
                    });
                  })
                }
              >
                <ThumbsUp className={cn("mr-1 size-4", course.liked && "fill-current")} />
                {course.liked ? "已点赞" : "点赞"}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  run(async () => {
                    const value = await toggleCourseFavorite(course.id);
                    onChange({ ...course, favorited: value.favorited });
                  })
                }
              >
                <Heart
                  className={cn("mr-1 size-4", course.favorited && "fill-rose-500 text-rose-500")}
                />
                {course.favorited ? "已收藏" : "收藏"}
              </Button>
            </div>
          )}
          {personalTracking && course.progress !== "completed" && (
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await completeCourse(course.id);
                  onChange({ ...course, progress: "completed" });
                  toast.success("已标记为学完");
                })
              }
            >
              <CheckCircle2 className="mr-1 size-4" />
              标记为已学完
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExamArea({
  exam,
  answers,
  result,
  pending,
  onAnswer,
  onLoad,
  onSubmit,
}: {
  exam: ExamPayload | null;
  answers: Record<string, string>;
  result: ExamResult | null;
  pending: boolean;
  onAnswer: (id: string, answer: string) => void;
  onLoad: () => void;
  onSubmit: () => void;
}) {
  if (!exam)
    return (
      <Button variant="outline" onClick={onLoad}>
        <PlayCircle className="mr-1 size-4" />
        加载课程考试
      </Button>
    );
  return (
    <section className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          课程考试 · 满分 {exam.totalScore} · {exam.passScore} 分及格
        </h3>
        {result && (
          <span
            className={cn(
              "rounded px-2 py-1 text-sm",
              result.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
            )}
          >
            上次 {result.score} 分 · {result.passed ? "已通过" : "未通过"}
          </span>
        )}
      </div>
      {exam.questions.map((question, index) => {
        const detail = result?.details?.find((item) => item.questionId === question.id);
        return (
          <div key={question.id} className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              {index + 1}. {question.title}（
              {question.type === "essay" ? "不自动计分" : `${question.score} 分`}）
            </p>
            {question.type === "choice" ? (
              question.options?.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === option}
                    onChange={() => onAnswer(question.id, option)}
                  />
                  {option}
                </label>
              ))
            ) : question.type === "essay" ? (
              <textarea
                className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
                value={answers[question.id] ?? ""}
                onChange={(e) => onAnswer(question.id, e.target.value)}
              />
            ) : (
              <Input
                value={answers[question.id] ?? ""}
                onChange={(e) => onAnswer(question.id, e.target.value)}
              />
            )}{" "}
            {detail && <AnswerResult detail={detail} />}
          </div>
        );
      })}
      <Button disabled={pending} onClick={onSubmit}>
        提交答案
      </Button>
    </section>
  );
}

function AnswerResult({ detail }: { detail: NonNullable<ExamResult["details"]>[number] }) {
  return (
    <p
      className={cn(
        "text-xs",
        detail.correct === true
          ? "text-emerald-600"
          : detail.correct === false
            ? "text-red-600"
            : "text-muted-foreground",
      )}
    >
      {detail.correct === null
        ? "问答内容已保存"
        : detail.correct
          ? "回答正确"
          : `回答错误${detail.correctAnswer ? `，正确答案：${detail.correctAnswer}` : ""}`}
    </p>
  );
}

function PersonalCenter({
  data,
  stats,
  tab,
  rankingType,
  onTab,
  onRankingType,
  onOpen,
}: {
  data: { favorites: CourseItem[]; history: CourseItem[]; training: MyTrainingItem[] } | null;
  stats: CourseStats;
  tab: "training" | "ranking" | "favorites" | "history";
  rankingType: "week" | "total";
  onTab: (tab: "training" | "ranking" | "favorites" | "history") => void;
  onRankingType: (type: "week" | "total") => void;
  onOpen: (course: CourseItem) => void;
}) {
  if (!data)
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">加载个人学习数据...</div>
    );
  const ranking = rankingType === "week" ? stats.weekRanking : stats.totalRanking;
  return (
    <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
      <aside className="space-y-1 border-r pr-4">
        {(
          [
            ["training", "我的培训", GraduationCap],
            ["ranking", "学习排行榜", Trophy],
            ["favorites", "我的收藏", Heart],
            ["history", "学习记录", History],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm",
              tab === key ? "bg-foreground text-background" : "hover:bg-muted",
            )}
            onClick={() => onTab(key)}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </aside>
      <section>
        {tab === "training" && <MyTrainingList items={data.training} onOpen={onOpen} />}
        {tab === "ranking" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">学习排行榜</h2>
              <div className="flex rounded-md border p-1">
                <button
                  className={cn("rounded px-3 py-1 text-sm", rankingType === "week" && "bg-muted")}
                  onClick={() => onRankingType("week")}
                >
                  本周
                </button>
                <button
                  className={cn("rounded px-3 py-1 text-sm", rankingType === "total" && "bg-muted")}
                  onClick={() => onRankingType("total")}
                >
                  总榜
                </button>
              </div>
            </div>
            <div className="divide-y border-y">
              {ranking.map((row, index) => (
                <div
                  key={row.userId}
                  className="grid grid-cols-[48px_1fr_auto_auto] items-center gap-3 py-3 text-sm"
                >
                  <span className="font-semibold tabular-nums">#{index + 1}</span>
                  <span>{row.name}</span>
                  <span>{row.count} 门</span>
                  <span className="w-24 text-right text-muted-foreground">{row.minutes} 分钟</span>
                </div>
              ))}
              {!ranking.length && (
                <p className="py-10 text-center text-sm text-muted-foreground">暂无学习数据</p>
              )}
            </div>
          </>
        )}
        {tab === "favorites" && (
          <>
            <h2 className="mb-4 font-semibold">我的收藏</h2>
            <MiniCourseList items={data.favorites} onOpen={onOpen} />
          </>
        )}
        {tab === "history" && (
          <>
            <h2 className="mb-4 font-semibold">学习记录</h2>
            <MiniCourseList items={data.history} onOpen={onOpen} />
          </>
        )}
      </section>
    </div>
  );
}

function MyTrainingList({
  items,
  onOpen,
}: {
  items: MyTrainingItem[];
  onOpen: (item: CourseItem) => void;
}) {
  const required = items.filter((item) => item.task.isRequired);
  const completed = required.filter((item) => item.task.status === "completed").length;
  const percent = required.length ? Math.round((completed / required.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <h2 className="font-semibold">我的培训</h2>
          <span className="text-muted-foreground">
            必修 {completed}/{required.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
      {!items.length ? (
        <p className="border border-dashed py-14 text-center text-sm text-muted-foreground">
          当前账号暂无培训任务
        </p>
      ) : (
        <div className="divide-y border-y">
          {items.map(({ task, course }) => (
            <button
              key={task.id}
              className="grid w-full gap-3 py-3 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
              onClick={() => onOpen(course)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{course.title}</p>
                <p className="text-xs text-muted-foreground">
                  {stageLabel(course.stage)} · {course.durationMin} 分钟
                </p>
              </div>
              <span
                className={cn(
                  "text-xs",
                  task.isRequired ? "text-red-600" : "text-muted-foreground",
                )}
              >
                {task.isRequired ? "必修" : "选修"}
              </span>
              <span className="text-xs text-muted-foreground">
                {task.deadline ? `截止 ${task.deadline}` : "无截止日期"}
              </span>
              <span className="flex items-center gap-2 sm:justify-end">
                <TrainingStatus value={task.status} />
                {task.score != null && (
                  <span className="text-xs text-muted-foreground">{task.score} 分</span>
                )}
              </span>
              {task.remark && (
                <span className="text-xs text-muted-foreground sm:col-span-full">
                  备注：{task.remark}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingStatus({ value }: { value: MyTrainingItem["task"]["status"] }) {
  return (
    <span
      className={cn(
        "text-xs",
        value === "completed" && "text-emerald-600",
        value === "failed" && "text-red-600",
      )}
    >
      {value === "completed"
        ? "已完成"
        : value === "failed"
          ? "未通过"
          : value === "in_progress"
            ? "学习中"
            : "未开始"}
    </span>
  );
}

function MiniCourseList({
  items,
  onOpen,
}: {
  items: CourseItem[];
  onOpen: (item: CourseItem) => void;
}) {
  if (!items.length)
    return (
      <p className="border border-dashed py-14 text-center text-sm text-muted-foreground">
        暂无记录
      </p>
    );
  return (
    <div className="divide-y border-y">
      {items.map((item) => (
        <button
          key={item.id}
          className="grid w-full grid-cols-[72px_1fr_auto] items-center gap-3 py-3 text-left"
          onClick={() => onOpen(item)}
        >
          <div className="aspect-video overflow-hidden rounded bg-muted">
            {item.coverPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="size-full object-cover" src={mediaUrl(item.coverPath) ?? ""} alt="" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">
              {stageLabel(item.stage)} · {item.durationMin} 分钟
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        size="icon"
        variant="outline"
        title="上一页"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-sm">
        {page} / {totalPages}
      </span>
      <Button
        size="icon"
        variant="outline"
        title="下一页"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-primary px-4 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}
function Status({ value }: { value: CourseItem["progress"] }) {
  return (
    <span className={cn("text-xs", value === "completed" && "text-emerald-600")}>
      {value === "completed" ? "已完成" : value === "in_progress" ? "学习中" : "未学习"}
    </span>
  );
}
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="p-1 text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function isLocalVideo(url: string | null) {
  return (
    !!url && (url.startsWith("/uploads/courses/") || /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i.test(url))
  );
}
function embedUrl(url: string | null) {
  if (!url) return null;
  const bili = url.match(/BV[\w]+/i)?.[0];
  if (bili) return `https://player.bilibili.com/player.html?bvid=${bili}&high_quality=1`;
  const youtube = url.match(/(?:v=|youtu\.be\/)([\w-]+)/)?.[1];
  if (youtube) return `https://www.youtube.com/embed/${youtube}`;
  return null;
}
