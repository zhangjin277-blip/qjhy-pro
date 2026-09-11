export const COURSE_CATEGORIES = [
  "途游斗地主",
  "捕鱼大作战",
  "途游休闲捕鱼",
  "3D捕鱼",
  "三国:冰河时代",
  "其他产品",
] as const;
export const COURSE_TYPES = ["collection", "video", "article", "live"] as const;
export const COURSE_STAGES = ["beginner", "growth", "advanced", "general"] as const;

export interface CourseChapter {
  id: string;
  title: string;
  durationMin?: number;
  content?: string;
  resourceUrl?: string;
}
export interface CourseItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  categories: string[];
  type: string;
  stage: string;
  coverPath: string | null;
  durationMin: number;
  chapters: CourseChapter[];
  content: string | null;
  videoUrl: string | null;
  instructor: string | null;
  views: number;
  likes: number;
  liked: boolean;
  hasExam: boolean;
  progress: "not_started" | "in_progress" | "completed";
  favorited: boolean;
  createdAt: string;
}
export interface CourseListResult {
  total: number;
  items: CourseItem[];
}
export interface CourseInput {
  id?: string;
  title: string;
  description?: string | null;
  category: string;
  categories?: string[];
  type: "collection" | "video" | "article" | "live";
  stage: "beginner" | "growth" | "advanced" | "general";
  coverPath?: string | null;
  durationMin?: number;
  content?: string | null;
  videoUrl?: string | null;
  instructor?: string | null;
  chapters?: CourseChapter[];
}
export interface LearningRankingItem {
  userId: string;
  name: string;
  count: number;
  minutes: number;
}
export interface CourseStats {
  totalCourses: number;
  completedCourses: number;
  totalMinutes: number;
  weekCourses: number;
  weekMinutes: number;
  weekRanking: LearningRankingItem[];
  totalRanking: LearningRankingItem[];
}
export interface ExamQuestion {
  id: string;
  type: "choice" | "fill" | "essay";
  title: string;
  options?: string[];
  score: number;
  answer?: string;
}
export interface ExamResult {
  score: number;
  totalScore: number;
  passScore?: number;
  passed: boolean;
  submittedAt: string;
  details?: {
    questionId: string;
    answer: string;
    correct: boolean | null;
    correctAnswer?: string;
  }[];
}
export interface ExamPayload {
  questions: ExamQuestion[];
  totalScore: number;
  passScore: number;
  previous?: ExamResult | null;
}
export interface TrainingTask {
  id: number;
  anchorId: string;
  courseId: string;
  courseTitle: string;
  isRequired: boolean;
  deadline: string | null;
  status: "not_started" | "in_progress" | "completed" | "failed";
  score: number | null;
  remark: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
export interface MyTrainingItem {
  task: TrainingTask;
  course: CourseItem;
}
export interface TrainingTemplate {
  id: number;
  name: string;
  project: string | null;
  courseIds: string[];
  description: string | null;
}
