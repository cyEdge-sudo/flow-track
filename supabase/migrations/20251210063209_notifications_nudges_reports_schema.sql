BEGIN;

-- Enums for notification statuses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nudge_status') THEN
    CREATE TYPE public.nudge_status AS ENUM ('scheduled','sent','failed','acknowledged');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE public.report_status AS ENUM ('scheduled','sent','failed');
  END IF;
END $$;

-- Nudge configuration per user
CREATE TABLE IF NOT EXISTS public.nudge_configs (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  times text[] NOT NULL DEFAULT ARRAY['09:00','13:00','17:00'],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Nudges log
CREATE TABLE IF NOT EXISTS public.nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  status public.nudge_status NOT NULL DEFAULT 'scheduled',
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Manager reports log
CREATE TABLE IF NOT EXISTS public.manager_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  sent_at timestamptz,
  status public.report_status NOT NULL DEFAULT 'scheduled',
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers
DROP TRIGGER IF EXISTS set_nudge_configs_updated_at ON public.nudge_configs;
CREATE TRIGGER set_nudge_configs_updated_at BEFORE UPDATE ON public.nudge_configs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_nudges_updated_at ON public.nudges;
CREATE TRIGGER set_nudges_updated_at BEFORE UPDATE ON public.nudges
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_manager_reports_updated_at ON public.manager_reports;
CREATE TRIGGER set_manager_reports_updated_at BEFORE UPDATE ON public.manager_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS enable
ALTER TABLE public.nudge_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_reports ENABLE ROW LEVEL SECURITY;

-- Policies: nudge_configs (self-managed)
DROP POLICY IF EXISTS "Users can view own nudge config" ON public.nudge_configs;
CREATE POLICY "Users can view own nudge config"
  ON public.nudge_configs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own nudge config" ON public.nudge_configs;
CREATE POLICY "Users can upsert own nudge config"
  ON public.nudge_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own nudge config" ON public.nudge_configs;
CREATE POLICY "Users can update own nudge config"
  ON public.nudge_configs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies: nudges (self log + ack)
DROP POLICY IF EXISTS "Users can read own nudges" ON public.nudges;
CREATE POLICY "Users can read own nudges"
  ON public.nudges FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own nudges" ON public.nudges;
CREATE POLICY "Users can insert own nudges"
  ON public.nudges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own nudges" ON public.nudges;
CREATE POLICY "Users can update own nudges"
  ON public.nudges FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies: manager_reports (manager only)
DROP POLICY IF EXISTS "Managers can read own reports" ON public.manager_reports;
CREATE POLICY "Managers can read own reports"
  ON public.manager_reports FOR SELECT
  USING (auth.uid() = manager_id);

DROP POLICY IF EXISTS "Managers can insert own reports" ON public.manager_reports;
CREATE POLICY "Managers can insert own reports"
  ON public.manager_reports FOR INSERT
  WITH CHECK (auth.uid() = manager_id);

DROP POLICY IF EXISTS "Managers can update own reports" ON public.manager_reports;
CREATE POLICY "Managers can update own reports"
  ON public.manager_reports FOR UPDATE
  USING (auth.uid() = manager_id)
  WITH CHECK (auth.uid() = manager_id);

COMMIT;