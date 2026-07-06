drop function if exists public.create_refund_request(uuid, uuid, text);

revoke all on function public.create_refund_request(uuid, text) from public, anon;
grant execute on function public.create_refund_request(uuid, text) to authenticated;
