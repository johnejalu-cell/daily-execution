import { NextResponse } from 'next/server';
import { db, authorized, loadState } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

const STATUSES = ['active', 'paused', 'done'];

function clean(b) {
  const out = {};
  if (typeof b.name === 'string' && b.name.trim()) out.name = b.name.trim();
  if (typeof b.next_step === 'string') out.next_step = b.next_step.trim();
  if (typeof b.notes === 'string') out.notes = b.notes;
  if (Number.isInteger(b.priority) && b.priority >= 1 && b.priority <= 5) out.priority = b.priority;
  if (STATUSES.includes(b.status)) out.status = b.status;
  return out;
}

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
  return handle(req, (b) => {
    const f = clean(b);
    if (!f.name) return { error: new Error('Name required') };
    return db.from('projects').insert(f);
  });
}

export async function PATCH(req) {
  return handle(req, (b) => {
    if (!b.id) return { error: new Error('id required') };
    return db.from('projects')
      .update({ ...clean(b), last_touched: new Date().toISOString() })
      .eq('id', b.id);
  });
}

export async function DELETE(req) {
  return handle(req, (b) => {
    if (!b.id) return { error: new Error('id required') };
    return db.from('projects').delete().eq('id', b.id);
  });
}
