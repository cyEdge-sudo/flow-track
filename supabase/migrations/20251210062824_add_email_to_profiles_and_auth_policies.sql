BEGIN;

-- Add email to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON public.profiles (lower(email));

-- Update signup trigger to also persist email and upsert
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

  INSERT INTO public.profiles (id, name, role, email)
  VALUES (NEW.id, name, role_txt::public.role_type, coalesce(NEW.email, ''))
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

-- Relax profiles SELECT policy so any authenticated user can discover collaborators
DROP POLICY IF EXISTS "Profiles are viewable by self and by manager of the user" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by any authenticated user" ON public.profiles;
CREATE POLICY "Profiles readable by any authenticated user"
  ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Keep self-update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Keep insert disabled (managed via trigger)
DROP POLICY IF EXISTS "Insert only via trigger for profiles" ON public.profiles;
CREATE POLICY "Insert only via trigger for profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (false);

COMMIT;