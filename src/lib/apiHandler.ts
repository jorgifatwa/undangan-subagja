import "server-only";
import { unstable_rethrow } from "next/navigation";
import { storageMode } from "./db";

// Wraps a route handler so storage failures reach the client as a JSON message instead of a bare 500
export const withErrors =
  <A extends unknown[]>(handler: (...args: A) => Promise<Response>) =>
  async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      unstable_rethrow(err); // Next.js control flow (prerender bail-out, redirects) must pass through
      console.error(err);
      const error =
        storageMode() === "missing"
          ? "Database belum dikonfigurasi: hubungkan Postgres ke project Vercel ini, lalu Redeploy."
          : "Server gagal memproses data, coba lagi sebentar lagi.";
      return Response.json({ error }, { status: 503 });
    }
  };
