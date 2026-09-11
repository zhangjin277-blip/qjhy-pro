CREATE TABLE IF NOT EXISTS "course" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "type" text NOT NULL,
  "stage" text NOT NULL,
  "cover_path" text,
  "duration_min" integer DEFAULT 0 NOT NULL,
  "chapters" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "content" text,
  "video_url" text,
  "instructor" text,
  "creator_user_id" text,
  "views" integer DEFAULT 0 NOT NULL,
  "likes" integer DEFAULT 0 NOT NULL,
  "has_exam" integer DEFAULT 0 NOT NULL,
  "exam_pass_score" integer DEFAULT 60 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "course_progress" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "course_id" text NOT NULL,
  "status" text DEFAULT 'in_progress' NOT NULL,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  CONSTRAINT "uq_course_progress" UNIQUE("user_id", "course_id")
);
CREATE TABLE IF NOT EXISTS "course_favorite" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "course_id" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_course_favorite" UNIQUE("user_id", "course_id")
);
CREATE TABLE IF NOT EXISTS "course_exam" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "course_id" text NOT NULL UNIQUE,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "total_score" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "course_exam_result" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "course_id" text NOT NULL,
  "user_id" text NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "total_score" integer DEFAULT 0 NOT NULL,
  "pass_score" integer DEFAULT 60 NOT NULL,
  "is_passed" integer DEFAULT 0 NOT NULL,
  "answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "submitted_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_course_exam_result" UNIQUE("user_id", "course_id")
);
ALTER TABLE "course" ADD CONSTRAINT "course_creator_user_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_favorite" ADD CONSTRAINT "course_favorite_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "course_favorite" ADD CONSTRAINT "course_favorite_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_exam" ADD CONSTRAINT "course_exam_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_exam" ADD CONSTRAINT "course_exam_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "course_exam_result" ADD CONSTRAINT "course_exam_result_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_exam_result" ADD CONSTRAINT "course_exam_result_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "idx_course_category" ON "course" ("category");
CREATE INDEX IF NOT EXISTS "idx_course_stage" ON "course" ("stage");
CREATE INDEX IF NOT EXISTS "idx_course_progress_user" ON "course_progress" ("user_id");

-- 课程中心默认全员可学习；总监/老板拥有完整管理权限。
INSERT INTO "role_default_permission" (position, module, scope, points, description, updated_at)
SELECT p.position,
       'courses',
       'all',
       CASE WHEN p.position IN ('总监', '老板')
         THEN '["course_edit","course_upload","course_delete","exam_manage","learning_stats"]'::jsonb
         ELSE '[]'::jsonb
       END,
       CASE WHEN p.position IN ('总监', '老板')
         THEN '课程中心完整管理'
         ELSE '课程中心：全员学习，管理员维护'
       END,
       now()
FROM (SELECT DISTINCT position FROM "role_default_permission") p
ON CONFLICT (position, module) DO NOTHING;
