import { NextRequest } from 'next/server';
import { sessionStore } from '@/lib/session-store';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;

  let ctrl: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      sessionStore.subscribe(id, ctrl);

      // Send the current session immediately on connect.
      const session = sessionStore.get(id);
      ctrl.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(session)}\n\n`)
      );
    },
    cancel() {
      sessionStore.unsubscribe(id, ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
