BEGIN;

-- Break recursive dependency between tasks SELECT policy and task_shares policies
-- by removing the task_shares policy that applied to ALL commands and referenced tasks.
DROP POLICY IF EXISTS "Owner can manage shares" ON public.task_shares;

-- Recreate granular policies that exclude SELECT to avoid recursion:
CREATE POLICY "Owner can insert shares"
  ON public.task_shares
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_shares.task_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update shares"
  ON public.task_shares
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_shares.task_id AND t.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_shares.task_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete shares"
  ON public.task_shares
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_shares.task_id AND t.owner_id = auth.uid()
    )
  );

-- Keep SELECT limited to recipient only (already exists) to avoid referencing tasks.
-- If not present in some environments, ensure it's created.
DROP POLICY IF EXISTS "Recipient can read own shares" ON public.task_shares;
CREATE POLICY "Recipient can read own shares"
  ON public.task_shares
  FOR SELECT
  USING (user_id = auth.uid());

COMMIT;