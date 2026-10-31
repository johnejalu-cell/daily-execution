import { NextResponse } from 'next/server';
import { db, authorized, loadState } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function DELETE(req) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { error } = await db.from('documents').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json(await loadState());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
