-- 剪辑工作台产品配置：补充造化仙府（幂等，可在已有环境直接执行）。
INSERT INTO "product_config" ("product_name", "display_short", "accent_color", "category")
VALUES ('造化仙府', '仙府', '#f43f5e', 'SLG')
ON CONFLICT ("product_name") DO UPDATE
SET "display_short" = EXCLUDED."display_short",
    "accent_color" = EXCLUDED."accent_color",
    "category" = EXCLUDED."category";
