import { createClient } from '@supabase/supabase-js';

export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export const TZ = 'Africa/Kampala';

export function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function authorized(req) {
  const code = process.env.APP_PASSCODE;
  return code && req.headers.get('x-passcode') === code;
}

export async function loadState() {
  const day = today();
  const [p, c, m, pl, tk] = await Promise.all([
    db.from('projects').select('*').neq('status', 'done').order('priority').order('last_touched'),
    db.from('commitments').select('*').eq('status', 'open').order('due_date', { nullsFirst: false }),
    db.from('messages').select('role,content,created_at').order('created_at', { ascending: false }).limit(60),
    db.from('plans').select('*').eq('day', day).maybeSingle(),
    db.from('tasks').select('*').order('start_date'),
  ]);
  return {
    day,
    projects: p.data || [],
    commitments: c.data || [],
    messages: (m.data || []).reverse(),
    plan: pl.data?.items || [],
    tasks: tk.data || [],
  };
}
