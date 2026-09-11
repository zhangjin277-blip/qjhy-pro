import { redirect } from "next/navigation";
import { requireCourseViewer } from "@/modules/course-center/authz";
import { listCourses } from "@/modules/course-center/queries";
import { getCourseStats } from "@/modules/course-center/stats";
import { CourseCenter } from "./_components/course-center";
export const dynamic = "force-dynamic";
export default async function CoursesPage() {
  let userId: string;
  let capabilities = {
    edit: false,
    upload: false,
    delete: false,
    exam: false,
    stats: false,
    personal: false,
  };
  try {
    const r = await requireCourseViewer();
    userId = r.userId;
    capabilities = {
      edit: r.perm.points.has("course_edit"),
      upload: r.perm.points.has("course_upload"),
      delete: r.perm.points.has("course_delete"),
      exam: r.perm.points.has("exam_manage"),
      stats: r.perm.points.has("learning_stats"),
      personal: !r.isEmergency,
    };
  } catch {
    redirect("/dashboard");
  }
  const [list, stats] = await Promise.all([
    listCourses({ page: 1, pageSize: 12, learningStatus: "all", sort: "latest" }, userId),
    getCourseStats(),
  ]);
  return (
    <CourseCenter
      initialItems={list.items}
      initialTotal={list.total}
      capabilities={capabilities}
      stats={stats}
    />
  );
}
