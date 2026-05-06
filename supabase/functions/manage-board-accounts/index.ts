import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  mode?: 'create' | 'update' | 'list';
  email?: string;
  password?: string;
  role?: 'patron' | 'residence';
  user_id?: string;
  emplacement_ids?: string[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'no_auth' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const missingEnv = [
      ['SUPABASE_URL', supabaseUrl],
      ['SUPABASE_ANON_KEY', anonKey],
      ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missingEnv.length > 0) {
      return json(500, { error: `supabase_env_missing: ${missingEnv.join(', ')}` });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roleRow, error: roleErr } = await admin
      .from('board_account_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (roleErr) return json(500, { error: roleErr.message });
    if (roleRow?.role !== 'patron') return json(403, { error: 'forbidden' });

    const body = (await req.json()) as Payload;
    const mode = body.mode ?? 'create';

    if (mode === 'list') {
      const [{ data: roles, error: rolesErr }, { data: accesses, error: accessesErr }] = await Promise.all([
        admin.from('board_account_roles').select('user_id, role').order('updated_at', { ascending: false }),
        admin.from('board_account_emplacements').select('user_id, emplacement_id'),
      ]);
      if (rolesErr) return json(500, { error: rolesErr.message });
      if (accessesErr) return json(500, { error: accessesErr.message });

      const accessMap = new Map<string, string[]>();
      (accesses ?? []).forEach((row: { user_id: string; emplacement_id: string }) => {
        const list = accessMap.get(row.user_id) ?? [];
        list.push(row.emplacement_id);
        accessMap.set(row.user_id, list);
      });

      const ids = Array.from(new Set((roles ?? []).map((r: { user_id: string }) => r.user_id)));
      const users = await Promise.all(
        ids.map(async (id) => {
          const { data } = await admin.auth.admin.getUserById(id);
          const email = data?.user?.email ?? null;
          return [id, email] as const;
        })
      );
      const emailById = new Map(users);

      const managers = (roles ?? []).map((r: { user_id: string; role: 'patron' | 'residence' }) => ({
        id: r.user_id,
        role: r.role,
        email: emailById.get(r.user_id) ?? null,
        emplacement_ids: accessMap.get(r.user_id) ?? [],
      }));

      return json(200, { ok: true, managers });
    }

    const role = body.role === 'residence' ? 'residence' : 'patron';
    const emplacementIds = Array.isArray(body.emplacement_ids)
      ? body.emplacement_ids.map((x) => String(x).trim()).filter(Boolean)
      : [];

    let targetUserId = String(body.user_id ?? '').trim();

    if (mode === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!email || !password || password.length < 8) {
        return json(400, { error: 'invalid_create_payload' });
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created.user) {
        return json(400, { error: createErr?.message ?? 'user_create_failed' });
      }
      targetUserId = created.user.id;
    }

    if (!targetUserId) return json(400, { error: 'user_id_required' });

    const { error: upsertRoleErr } = await admin
      .from('board_account_roles')
      .upsert({ user_id: targetUserId, role }, { onConflict: 'user_id' });
    if (upsertRoleErr) return json(500, { error: upsertRoleErr.message });

    const { error: deleteAccessErr } = await admin
      .from('board_account_emplacements')
      .delete()
      .eq('user_id', targetUserId);
    if (deleteAccessErr) return json(500, { error: deleteAccessErr.message });

    if (role === 'residence' && emplacementIds.length > 0) {
      const rows = emplacementIds.map((emplacement_id) => ({
        user_id: targetUserId,
        emplacement_id,
      }));
      const { error: insertAccessErr } = await admin
        .from('board_account_emplacements')
        .insert(rows);
      if (insertAccessErr) return json(500, { error: insertAccessErr.message });
    }

    return json(200, {
      ok: true,
      user_id: targetUserId,
      role,
      emplacement_ids: role === 'residence' ? emplacementIds : [],
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

function json(status: number, obj: Record<string, unknown>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
