import { NextResponse } from 'next/server';
import { db, authorized, loadState } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['todo', 'doing', 'done'];

function clean(b) {
  const out = {};
  if (typeof b.title === 'string' && b.title.trim()) out.title = b.title.trim();
  if (DATE.test(b.start_date || '')) out.start_date = b.start_date;
  if (DATE.test(b.end_date || '')) out.end_date = b.end_date;
  if (STATUSES.includes(b.status)) out.status = b.status;
  if (Number.isInteger(b.progress) && b.progress >= 0 && b.progress <= 100) out.progress = b.progress;
  if (out.status === 'done') out.progress = 100;
  return out;
}

const touch = (id) =>
  db.from('projects').update({ last_touched: new Date().toISOString() }).eq('id', id);

async function handle(req, fn) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { error } = await fn(body);
    if (error) throw error;
    return NextResponse.json(await loadState());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  return handle(req, async (b) => {
    const f = clean(b);
    if (!b.project_id || !f.title || !f.start_date || !f.end_date) {
      return { error: new Error('Title, start and end dates required') };
    }
    if (f.end_date < f.start_date) return { error: new Error('End date is before start date') };
    const res = await db.from('tasks').insert({ ...f, project_id: b.project_id });
    if (!res.error) await touch(b.project_id);
    return res;
  });
}

export async function PATCH(req) {
  return handle(req, async (b) => {
    if (!b.id) return { error: new Error('id required') };
    const f = clean(b);
    if (f.start_date && f.end_date && f.end_date < f.start_date) {
      return { error: new Error('End date is before start date') };
    }
    const res = await db.from('tasks').update(f).eq('id', b.id).select().single();
    if (!res.error && res.data) await touch(res.data.project_id);
    return { error: res.error };
  });
}

export async function DELETE(req) {
  return handle(req, (b) => {
    if (!b.id) return { error: new Error('id required') };
    return db.from('tasks').delete().eq('id', b.id);
  });
}
