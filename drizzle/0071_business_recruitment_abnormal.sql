ALTER TABLE "business_recruitment_candidate"
  ADD COLUMN IF NOT EXISTS "abnormal_note" text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_recruitment_signing_check') THEN
    ALTER TABLE "business_recruitment_candidate" DROP CONSTRAINT "business_recruitment_signing_check";
  END IF;
  ALTER TABLE "business_recruitment_candidate"
    ADD CONSTRAINT "business_recruitment_signing_check"
    CHECK ("signing_status" IN ('pending', 'signed', 'declined', 'abnormal'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "business_recruitment_candidate"
  DROP CONSTRAINT IF EXISTS "business_recruitment_status_check";
ALTER TABLE "business_recruitment_candidate"
  ADD CONSTRAINT "business_recruitment_status_check"
  CHECK ("status" IN ('draft', 'business_review', 'operation_review', 'signing', 'signed', 'live', 'rejected', 'abnormal'));
