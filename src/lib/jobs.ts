import { and, eq, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { closeFinishedClasses } from "./booking";
import { generateClasses } from "./schedule";

/**
 * The nightly job: close yesterday's classes, top the schedule up and expire
 * passes. Each step is idempotent, so a retried or doubled run is harmless.
 */
export async function runDaily(now = new Date()) {
  const closed = await closeFinishedClasses(now);
  const gyms = await db.select({ id: schema.gym.id, timezone: schema.gym.timezone }).from(schema.gym);
  let scheduled = 0;
  for (const gym of gyms) scheduled += await generateClasses(gym, now);
  // Stripe subscriptions are kept current by webhooks; only manual passes lapse here.
  const expired = await db
    .update(schema.membership)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.membership.status, "active"),
        lt(schema.membership.expiresAt, now),
        isNull(schema.membership.stripeSubscriptionId),
      ),
    )
    .returning({ id: schema.membership.id });
  return { classesClosed: closed.closed, classesScheduled: scheduled, passesExpired: expired.length };
}
