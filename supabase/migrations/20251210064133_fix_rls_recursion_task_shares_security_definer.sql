BEGIN;

-- Security definer helper to check if current auth user owns the task
CREATE OR REPLACE FUNCTION public.is_task_owner(task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  RETURN EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_id AND t.owner_id = uid
  );
END;
$$;

-- Replace task_shares policies to avoid referencing public.tasks directly
DROP POLICY IF EXISTS "Owner can insert shares" ON public.task_shares;
DROP POLICY IF EXISTS "Owner can update shares" ON public.task_shares;
DROP POLICY IF EXISTS "Owner can delete shares" ON public.task_shares;

CREATE POLICY "Owner can insert shares"
  ON public.task_shares
  FOR INSERT
  WITH CHECK (public.is_task_owner(task_id));

CREATE POLICY "Owner can update shares"
  ON public.task_shares
  FOR UPDATE
  USING (public.is_task_owner(task_id))
  WITH CHECK (public.is_task_owner(task_id));

CREATE POLICY "Owner can delete shares"
  ON public.task_shares
  FOR DELETE
  USING (public.is_task_owner(task_id));

COMMIT;