-- 素材时长（秒）：上传成品时由前端读取视频时长写入；老任务为 null
ALTER TABLE "editing_task" ADD COLUMN IF NOT EXISTS "source_duration_sec" integer;
