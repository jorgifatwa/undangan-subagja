import { weddingIcs } from "@/lib/weddingEvent";

// Calendar file behind "Simpan ke Kalender" on iPhone / Mac: Safari opens it straight in the Calendar app.
// It reads nothing from the request, so it is prerendered at build time.
export function GET() {
  return new Response(weddingIcs(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pernikahan-annisa-rizki.ics"',
    },
  });
}
