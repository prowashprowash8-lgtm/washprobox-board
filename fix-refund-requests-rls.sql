drop policy if exists "allow_all_refunds" on public.refund_requests;

create policy "refund_requests_select"
  on public.refund_requests for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.board_account_roles
      where user_id = auth.uid() and role = 'patron'
    )
  );

revoke insert, update, delete on public.refund_requests from authenticated;
revoke all on public.refund_requests from anon, public;
