import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";
import { db, schema } from "@/db";
import { makeGym, makeMember, resetDb } from "./factories";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_placeholder");
let n = 0;

function deliver(type: string, object: Record<string, unknown>, opts: { id?: string; secret?: string } = {}) {
  const payload = JSON.stringify({
    id: opts.id ?? `evt_test_${++n}`,
    object: "event",
    type,
    api_version: "2026-09-30.endive",
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET });
  return POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
}

function packCheckout(gymId: string, memberId: string, planId: string, id = `cs_test_${++n}`) {
  return {
    id,
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 18000,
    subscription: null,
    metadata: { kind: "member", gymId, memberId, planId },
  };
}

beforeEach(resetDb);
afterAll(resetDb);

describe("stripe webhook", () => {
  it("rejects a bad signature", async () => {
    const res = await deliver("checkout.session.completed", {}, { secret: "whsec_wrong" });
    expect(res.status).toBe(400);
  });

  it("grants a class pack when checkout completes", async () => {
    const { gym, pack } = await makeGym();
    const { member } = await makeMember(gym.id);
    const res = await deliver("checkout.session.completed", packCheckout(gym.id, member.id, pack.id));
    expect(res.status).toBe(200);
    const rows = await db.query.membership.findMany({ where: eq(schema.membership.memberId, member.id) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paidVia: "stripe", creditsRemaining: 10, status: "active" });
  });

  it("processes a redelivered event once", async () => {
    const { gym, pack } = await makeGym();
    const { member } = await makeMember(gym.id);
    const session = packCheckout(gym.id, member.id, pack.id);
    await deliver("checkout.session.completed", session, { id: "evt_same" });
    const again = await deliver("checkout.session.completed", session, { id: "evt_same" });
    expect(await again.json()).toMatchObject({ result: "duplicate" });
    // A different event for the same session (e.g. async success) still can't double-grant.
    await deliver("checkout.session.async_payment_succeeded", session);
    const rows = await db.query.membership.findMany({ where: eq(schema.membership.memberId, member.id) });
    expect(rows).toHaveLength(1);
  });

  it("ignores unpaid sessions and sessions for another gym's member", async () => {
    const { gym, pack } = await makeGym();
    const other = await makeGym();
    const { member } = await makeMember(gym.id);
    await deliver("checkout.session.completed", { ...packCheckout(gym.id, member.id, pack.id), payment_status: "unpaid" });
    await deliver("checkout.session.completed", packCheckout(other.gym.id, member.id, other.pack.id));
    expect(await db.query.membership.findMany({ where: eq(schema.membership.memberId, member.id) })).toHaveLength(0);
  });

  it("drops a gym to Free when its Pro subscription is cancelled", async () => {
    const { gym } = await makeGym({ saasPlan: "pro", stripeSubscriptionId: "sub_test_pro" });
    await deliver("customer.subscription.deleted", {
      id: "sub_test_pro",
      object: "subscription",
      status: "canceled",
      metadata: { kind: "saas", gymId: gym.id },
      items: { data: [] },
    });
    const row = await db.query.gym.findFirst({ where: eq(schema.gym.id, gym.id) });
    expect(row).toMatchObject({ saasPlan: "free", stripeSubscriptionId: null });
  });

  it("marks a member's monthly membership past due when renewal fails", async () => {
    const { gym, monthly } = await makeGym();
    const { member } = await makeMember(gym.id);
    await db.insert(schema.membership).values({
      gymId: gym.id,
      memberId: member.id,
      planId: monthly.id,
      paidVia: "stripe",
      stripeSubscriptionId: "sub_test_member",
    });
    await deliver("customer.subscription.updated", {
      id: "sub_test_member",
      object: "subscription",
      status: "past_due",
      metadata: { kind: "member", gymId: gym.id, memberId: member.id, planId: monthly.id },
      items: { data: [{ current_period_end: 1893456000 }] },
    });
    const row = await db.query.membership.findFirst({ where: eq(schema.membership.memberId, member.id) });
    expect(row?.status).toBe("past_due");
  });

  it("enables card payments when the connected account is ready", async () => {
    const { gym } = await makeGym({ stripeAccountId: "acct_test_1" });
    await deliver("account.updated", { id: "acct_test_1", object: "account", charges_enabled: true });
    expect((await db.query.gym.findFirst({ where: eq(schema.gym.id, gym.id) }))?.chargesEnabled).toBe(true);
  });
});
