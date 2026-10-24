import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import type { Gym } from "./tenant";
import { randomCode } from "./utils";

export const FREE_MEMBER_LIMIT = 30;

export class LimitError extends Error {}

export async function activeMemberCount(gymId: string, tx: Tx | typeof db = db) {
  const [row] = await tx
    .select({ n: count() })
    .from(schema.member)
    .where(and(eq(schema.member.gymId, gymId), ne(schema.member.status, "cancelled")));
  return row.n;
}

/**
 * The one place members get created, so the Free plan cap can't be bypassed.
 * Locks the gym row so two signups can't both take the 30th seat.
 */
export async function createMember(
  gym: Pick<Gym, "id">,
  input: { name: string; email: string; userId?: string | null },
) {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ saasPlan: schema.gym.saasPlan })
      .from(schema.gym)
      .where(eq(schema.gym.id, gym.id))
      .for("update");
    if (locked.saasPlan === "free" && (await activeMemberCount(gym.id, tx)) >= FREE_MEMBER_LIMIT) {
      throw new LimitError(
        `This gym is on the Free plan, which allows ${FREE_MEMBER_LIMIT} active members. Upgrade to Pro to add more.`,
      );
    }
    const email = input.email.trim().toLowerCase();
    const existing = await tx.query.member.findFirst({
      where: and(eq(schema.member.gymId, gym.id), eq(schema.member.email, email)),
    });
    if (existing) {
      // Re-link a member that staff created before they had a login.
      if (input.userId && !existing.userId) {
        const [updated] = await tx
          .update(schema.member)
          .set({ userId: input.userId, status: "active" })
          .where(eq(schema.member.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }
    const [created] = await tx
      .insert(schema.member)
      .values({
        gymId: gym.id,
        name: input.name.trim(),
        email,
        userId: input.userId ?? null,
        checkinCode: randomCode(),
      })
      .returning();
    return created;
  });
}
