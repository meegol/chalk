import "server-only";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";

export type Plan = typeof schema.plan.$inferSelect;
export type Membership = typeof schema.membership.$inferSelect;

export function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/** Create a membership from a plan. Shared by cash payments and Stripe webhooks. */
export async function grantMembership(
  tx: Tx | typeof db,
  input: {
    gymId: string;
    memberId: string;
    plan: Plan;
    paidVia: "stripe" | "cash";
    stripeCheckoutSessionId?: string;
    stripeSubscriptionId?: string;
    periodEnd?: Date;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const { plan } = input;
  const expiresAt =
    plan.kind === "monthly"
      ? (input.periodEnd ?? addMonths(now, 1))
      : plan.validDays
        ? new Date(now.getTime() + plan.validDays * 86_400_000)
        : null;
  const [row] = await tx
    .insert(schema.membership)
    .values({
      gymId: input.gymId,
      memberId: input.memberId,
      planId: plan.id,
      paidVia: input.paidVia,
      creditsRemaining: plan.kind === "monthly" ? null : (plan.credits ?? 1),
      expiresAt,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      stripeSubscriptionId: input.stripeSubscriptionId,
    })
    .onConflictDoNothing({ target: schema.membership.stripeCheckoutSessionId })
    .returning();
  return row ?? null;
}

/** Memberships that can pay for a class right now, unlimited first, then soonest-expiring pack. */
export function usableMembershipsQuery(tx: Tx | typeof db, memberId: string, at: Date) {
  return tx
    .select()
    .from(schema.membership)
    .where(
      and(
        eq(schema.membership.memberId, memberId),
        eq(schema.membership.status, "active"),
        or(isNull(schema.membership.expiresAt), gt(schema.membership.expiresAt, at)),
        or(isNull(schema.membership.creditsRemaining), gt(schema.membership.creditsRemaining, 0)),
      ),
    )
    .orderBy(
      sql`${schema.membership.creditsRemaining} is not null`,
      asc(sql`coalesce(${schema.membership.expiresAt}, 'infinity'::timestamptz)`),
      asc(schema.membership.createdAt),
    );
}

export async function getMemberMemberships(memberId: string) {
  return db
    .select({ membership: schema.membership, plan: schema.plan })
    .from(schema.membership)
    .innerJoin(schema.plan, eq(schema.plan.id, schema.membership.planId))
    .where(eq(schema.membership.memberId, memberId))
    .orderBy(sql`${schema.membership.createdAt} desc`);
}

export function describeMembership(m: Membership, plan: Plan, now = new Date()) {
  const expired = m.expiresAt != null && m.expiresAt <= now;
  const empty = m.creditsRemaining != null && m.creditsRemaining <= 0;
  const usable = m.status === "active" && !expired && !empty;
  let label: string;
  if (m.status === "cancelled") label = "Cancelled";
  else if (m.status === "past_due") label = "Payment failed";
  else if (expired) label = "Expired";
  else if (empty) label = "Used up";
  else if (plan.kind === "monthly") label = "Unlimited";
  else label = `${m.creditsRemaining} left`;
  return { usable, label };
}
