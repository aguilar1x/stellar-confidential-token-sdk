/**
 * The payment endpoint, streamed.
 *
 * NDJSON rather than Server-Sent Events: the client only reads forward and never
 * reconnects, so SSE's event-id/retry machinery would be weight for nothing.
 * One JSON object per line is trivial to parse off a byte reader.
 *
 * `maxDuration` matters. Proving plus a ledger close comfortably exceeds the
 * default serverless timeout, and a request cut off mid-proof would look exactly
 * like a bug in the cryptography rather than a platform limit.
 */

import { runPayment } from "@/app/demo/payment-flow";
import type { PaymentEvent } from "@/app/demo/payment-types";

/**
 * bb.js caches the CRS under `os.homedir() + "/.bb-crs"`, and a serverless
 * filesystem is read-only apart from /tmp — so the default path fails at
 * `mkdir`, at the moment proving starts and not before. Node derives
 * `homedir()` from $HOME on POSIX, so pointing $HOME at /tmp is enough, and it
 * has to happen before the lazy `@aztec/bb.js` import rather than inside the
 * request.
 */
if (process.env.VERCEL) process.env.HOME = "/tmp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let amountStroops = "";
  try {
    amountStroops = String(((await req.json()) as { amountStroops?: unknown }).amountStroops ?? "");
  } catch {
    return new Response(JSON.stringify({ type: "error", error: "Expected a JSON body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: PaymentEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      };
      try {
        await runPayment(amountStroops, emit);
      } catch (e) {
        // runPayment already reports its own failures; this is the belt for a
        // throw in the emit path itself, so the reader gets a line either way.
        emit({ type: "error", error: String((e as Error)?.message ?? e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // Defeats proxy buffering, which would hold the stages back and deliver
      // them in one burst at the end — the exact failure this endpoint exists
      // to avoid.
      "x-accel-buffering": "no",
    },
  });
}
