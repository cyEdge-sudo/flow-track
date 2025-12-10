BEGIN;

-- Enable required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_type') THEN
    CREATE TYPE public.role_type AS ENUM ('user', 'manager');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE public.task_status AS ENUM ('todo','in_progress','done');
  END IF;
END $$;

-- Profiles table linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role public.role_type NOT NULL DEFAULT 'user',
  manager_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Insert profile on user signup using metadata (name, role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta jsonb;
  name text;
  role_txt text;
BEGIN
  meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  name := coalesce(meta->>'name', '');
  role_txt := coalesce(meta->>'role', 'user');

  INSERT INTO public.profiles (id, name, role)
  VALUES (NEW.id, name, role_txt::public.role_type)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date NOT NULL,
  status public.task_status NOT NULL DEFAULT 'todo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_tasks_updated_at ON public.tasks;
CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Task shares (many-to-many)
CREATE TABLE IF NOT EXISTS public.task_shares (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_shares ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Profiles are viewable by self and by manager of the user" ON public.profiles;
CREATE POLICY "Profiles are viewable by self and by manager of the user"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR manager_id = auth.uid()
    OR (role = 'manager' AND id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Insert only via trigger for profiles" ON public.profiles;
CREATE POLICY "Insert only via trigger for profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (false);

-- Tasks policies
DROP POLICY IF EXISTS "Task owner can do everything" ON public.tasks;
CREATE POLICY "Task owner can do everything"
  ON public.tasks
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Shared users and managers can read tasks" ON public.tasks;
CREATE POLICY "Shared users and managers can read tasks"
  ON public.tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.task_shares ts
      WHERE ts.task_id = tasks.id AND ts.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = tasks.owner_id AND p.manager_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shared users can update limited fields" ON public.tasks;
CREATE POLICY "Shared users can update limited fields"
  ON public.tasks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.task_shares ts
      WHERE ts.task_id = tasks.id AND ts.user_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- Restrict non-owner updates to limited columns
CREATE OR REPLACE FUNCTION public.restrict_task_updates()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  is_owner boolean;
BEGIN
  is_owner := (auth.uid() = NEW.owner_id);

  IF NOT is_owner THEN
    IF (NEW.title IS DISTINCT FROM OLD.title)
       OR (NEW.description IS DISTINCT FROM OLD.description)
       OR (NEW.due_date IS DISTINCT FROM OLD.due_date)
       OR (NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
      RAISE EXCEPTION 'Only owner can modify title, description, due_date, or owner';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_task_updates ON public.tasks;
CREATE TRIGGER enforce_task_updates
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.restrict_task_updates();

-- Task shares policies
DROP POLICY IF EXISTS "Owner can manage shares" ON public.task_shares;
CREATE POLICY "Owner can manage shares"
  ON public.task_shares
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_shares.task_id AND t.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_shares.task_id AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recipient can read own shares" ON public.task_shares;
CREATE POLICY "Recipient can read own shares"
  ON public.task_shares
  FOR SELECT
  USING (user_id = auth.uid());

COMMIT;