import { NextResponse } from 'next/server';
import { authorized, loadState } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await loadState());
}
