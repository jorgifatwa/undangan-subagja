import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import { DEFAULT_TEMPLATE, getSettings, saveSettings } from "@/lib/guestsStore";
import { withErrors } from "@/lib/apiHandler";

export const GET = withErrors(async () => {
  if (!(await isAdminRequest())) return unauthorized();
  return Response.json({ settings: await getSettings(), defaultTemplate: DEFAULT_TEMPLATE });
});

export const PUT = withErrors(async (request: Request) => {
  if (!(await isAdminRequest())) return unauthorized();
  const { template } = ((await request.json().catch(() => ({}))) ?? {}) as { template?: unknown };
  if (typeof template !== "string" || template.trim().length < 10 || template.length > 4000) {
    return Response.json({ error: "Template pesan harus 10-4000 karakter." }, { status: 400 });
  }
  if (!template.includes("{link}")) {
    return Response.json({ error: "Template harus memuat {link} agar tamu menerima link undangan." }, { status: 400 });
  }
  return Response.json({ settings: await saveSettings({ template }) });
});
