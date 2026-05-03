-- 用户预设保存当前项目筛选（"all" / "ddz" / "three"），默认 "all"
ALTER TABLE "user_column_preset" ADD COLUMN IF NOT EXISTS "project" TEXT NOT NULL DEFAULT 'all';
