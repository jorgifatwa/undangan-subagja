import { isAdminConfigured, isAdminRequest } from "@/lib/adminAuth";
import { storageMode } from "@/lib/db";
import { withErrors } from "@/lib/apiHandler";

export const GET = withErrors(async () =>
  Response.json({ authenticated: await isAdminRequest(), configured: await isAdminConfigured(), storage: storageMode() }),
);
