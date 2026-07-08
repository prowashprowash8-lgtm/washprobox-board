import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  email?: string;
  password?: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
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
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const firstName = String(body.first_name ?? '').trim() || null;
    const lastName = String(body.last_name ?? '').trim() || null;
    const phone = String(body.phone ?? '').trim() || null;

    if (!email || !password || password.length < 8) {
      return json(400, { error: 'invalid_create_payload' });
    }

    // Même email déjà utilisé (app, board ou CRM) : Supabase n'autorise qu'un seul compte
    // par email dans tout le projet.
    const { data: existingProfile, error: existingProfileErr } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingProfileErr) return json(500, { error: existingProfileErr.message });
    if (existingProfile?.id) {
      return json(400, { error: 'email_already_used' });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, phone },
    });
    if (createErr || !created.user) {
      return json(400, { error: createErr?.message ?? 'user_create_failed' });
    }

    return json(200, { ok: true, user_id: created.user.id });
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
