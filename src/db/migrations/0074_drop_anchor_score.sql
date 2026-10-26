-- 捕鱼系「未上传素材扣分」功能废弃（2026-10-08），删除其两张表。
-- 上线以来因 id 空间错配从未写入数据（生产 anchor_score_log 0 行）；
-- 安全守卫：若表里有数据则中止，需人工确认后再删。可重跑。
DO $$
DECLARE
  t text;
  has_rows boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['anchor_score_log', 'anchor_score'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', t) INTO has_rows;
      IF has_rows THEN
        RAISE EXCEPTION '% 有数据，中止删除，请人工确认', t;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS "anchor_score_log";
DROP TABLE IF EXISTS "anchor_score";
