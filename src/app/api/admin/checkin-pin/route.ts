import { PIN_PATTERN, isAdminRequest, isPinSet, savePin, unauthorized } from "@/lib/adminAuth";
import { withErrors } from "@/lib/apiHandler";

// The reception desk PIN: whether one is set, and setting / changing it (changing it logs every desk phone out)
export const GET = withErrors(async () => {
  if (!(await isAdminRequest())) return unauthorized();
  return Response.json({ pinSet: await isPinSet() });
});

export const PUT = withErrors(async (request: Request) => {
  if (!(await isAdminRequest())) return unauthorized();
  const { pin } = ((await request.json().catch(() => ({}))) ?? {}) as { pin?: unknown };
  if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) return Response.json({ error: "PIN harus 6 angka." }, { status: 400 });
  await savePin(pin);
  return Response.json({ pinSet: true });
});
