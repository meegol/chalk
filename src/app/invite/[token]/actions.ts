"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { createMember } from "@/lib/members";
import { requireUser } from "@/lib/session";

export async function acceptInvite(token: string) {
  const user = await requireUser(`/invite/${token}`);
  const [inv] = await db
    .update(schema.invite)
    .set({ acceptedAt: new Date() })
    .where(
      and(
        eq(schema.invite.token, token),
        isNull(schema.invite.acceptedAt),
        gt(schema.invite.expiresAt, new Date()),
        eq(schema.invite.email, user.email.toLowerCase()),
      ),
    )
    .returning();
  if (!inv) redirect(`/invite/${token}`);
  const gym = await db.query.gym.findFirst({ where: eq(schema.gym.id, inv.gymId) });
  if (!gym) redirect("/home");

  if (inv.role === "coach") {
    await db
      .insert(schema.staff)
      .values({ gymId: gym.id, userId: user.id, role: "coach" })
      .onConflictDoNothing();
    await audit(gym.id, user.id, "invite.accepted", { role: "coach" });
    redirect(`/g/${gym.slug}/admin`);
  }
  await createMember(gym, { name: user.name, email: user.email, userId: user.id });
  await audit(gym.id, user.id, "invite.accepted", { role: "member" });
  redirect(`/g/${gym.slug}`);
}
