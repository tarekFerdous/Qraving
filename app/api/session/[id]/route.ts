import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/lib/session-store';
import type { Session } from '@/lib/session';

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  return NextResponse.json(sessionStore.get(id));
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const { session } = (await req.json()) as { session: Session };
  sessionStore.set(id, session);
  return NextResponse.json(session);
}
