CREATE TABLE IF NOT EXISTS "zhaohua_official_replay" (
  "room_id" text PRIMARY KEY,
  "account_name" text NOT NULL DEFAULT '造化仙府丨孙小圣',
  "title" text,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz,
  "duration_seconds" integer,
  "exposure_uv" bigint,
  "enter_room_uv" bigint,
  "enter_room_rate" double precision,
  "avg_online" double precision,
  "peak_online" integer,
  "avg_watch_seconds" integer,
  "sound_wave" bigint,
  "gift_users" integer,
  "new_followers" integer,
  "comment_users" integer,
  "like_count" bigint,
  "share_count" integer,
  "fan_club_users" integer,
  "game_revenue" double precision,
  "game_activations" integer,
  "game_purchases" integer,
  "base_raw" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "overview_raw" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "game_raw" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "history_raw" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "synced_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_zhaohua_official_replay_started_at"
  ON "zhaohua_official_replay" ("started_at");
