const allowedOrigins = new Set([
  'https://kfarmai.com',
  'https://www.kfarmai.com',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

function responseHeaders(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://kfarmai.com',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) return json(request, { ok: false, error: 'ORIGIN_NOT_ALLOWED' }, 403);

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json(request, { ok: false, error: 'AUTH_REQUIRED' }, 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, { ok: false, error: 'INVALID_JSON' }, 400);
  }
  if (payload.confirmation !== 'DELETE_MY_ACCOUNT') {
    return json(request, { ok: false, error: 'CONFIRMATION_REQUIRED' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(request, { ok: false, error: 'SERVER_NOT_CONFIGURED' }, 503);
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization }
    });
    if (!userResponse.ok) return json(request, { ok: false, error: 'INVALID_SESSION' }, 401);

    const user = await userResponse.json();
    if (!user?.id) return json(request, { ok: false, error: 'INVALID_SESSION' }, 401);

    const requestedAt = new Date().toISOString();
    const queueResponse = await fetch(`${supabaseUrl}/rest/v1/account_deletion_requests?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        user_id: user.id,
        status: 'pending',
        requested_at: requestedAt,
        updated_at: requestedAt,
        resolved_at: null,
        resolution_note: null
      })
    });

    if (!queueResponse.ok) {
      console.error('account deletion request write failed', queueResponse.status);
      return json(request, { ok: false, error: 'REQUEST_NOT_RECORDED' }, 503);
    }

    const rows = await queueResponse.json();
    const record = Array.isArray(rows) ? rows[0] : rows;
    return json(request, {
      ok: true,
      requestId: record?.id || null,
      status: record?.status || 'pending',
      requestedAt: record?.requested_at || requestedAt
    });
  } catch (error) {
    console.error('account deletion request failed', error instanceof Error ? error.message : 'unknown');
    return json(request, { ok: false, error: 'SERVER_ERROR' }, 500);
  }
});
