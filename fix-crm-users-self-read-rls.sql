drop policy if exists "board_all_crm_users" on public.crm_users;
create policy "staff_all_crm_users" on public.crm_users for all to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.board_account_roles where user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.board_account_roles where user_id = auth.uid())
  );
