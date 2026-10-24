import "server-only";
import { db, schema, type Tx } from "@/db";

export async function audit(
  gymId: string,
  actorUserId: string | null,
  action: string,
  meta: Record<string, unknown> = {},
  tx: Tx | typeof db = db,
) {
  await tx.insert(schema.auditLog).values({ gymId, actorUserId, action, meta });
}
