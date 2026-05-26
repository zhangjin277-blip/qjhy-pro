CREATE OR REPLACE FUNCTION set_updated_at_now() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS editing_task_set_updated_at ON editing_task;
CREATE TRIGGER editing_task_set_updated_at
BEFORE UPDATE ON editing_task
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
