import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Role = 'patron' | 'salarie';

type Payload = {
  mode?: 'create';
  email?: string;
  password?: string;
  first_name?: string | null;
  role?: Role;
  is_active?: boolean;
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

    // Autoriser uniquement les patrons (board)
    const { data: roleRow, error: roleErr } = await admin
      .from('board_account_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (roleErr) return json(500, { error: roleErr.message });
    if (roleRow?.role !== 'patron') return json(403, { error: 'forbidden' });

    const body = (await req.json()) as Payload;
    const mode = body.mode ?? 'create';
    if (mode !== 'create') return json(400, { error: 'invalid_mode' });

    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const firstName = String(body.first_name ?? '').trim() || null;
    const role: Role = body.role === 'patron' ? 'patron' : 'salarie';
    const isActive = body.is_active !== false;

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

    const userId = created.user.id;

    const { error: upsertErr } = await admin.from('crm_users').upsert(
      {
        id: userId,
        email,
        first_name: firstName,
        role,
        is_active: isActive,
      },
      { onConflict: 'id' }
    );
    if (upsertErr) return json(500, { error: upsertErr.message });

    return json(200, { ok: true, user_id: userId });
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

