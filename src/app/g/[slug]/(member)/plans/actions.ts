"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { startMemberCheckout } from "@/lib/billing";
import { requireMember } from "@/lib/tenant";
import type { ActionState } from "@/lib/utils";

export async function buyPlan(slug: string, planId: string): Promise<ActionState> {
  const { gym, member } = await requireMember(slug);
  const plan = await db.query.plan.findFirst({
    where: and(eq(schema.plan.id, planId), eq(schema.plan.gymId, gym.id), eq(schema.plan.active, true)),
  });
  if (!plan) return { error: "That plan isn't available any more" };
  if (!gym.chargesEnabled) return { error: "Card payments aren't set up here yet. Pay at the front desk." };
  if (plan.kind === "monthly") {
    const current = await db.query.membership.findFirst({
      where: and(
        eq(schema.membership.memberId, member.id),
        eq(schema.membership.planId, plan.id),
        eq(schema.membership.status, "active"),
      ),
    });
    if (current?.stripeSubscriptionId) return { error: "You already have this membership" };
  }
  redirect(await startMemberCheckout(gym, member, plan));
}
