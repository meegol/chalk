import "server-only";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { grantMembership } from "./memberships";
import { PLATFORM_FEE_PERCENT, stripe } from "./stripe";
import type { Gym, MemberRow } from "./tenant";
import { appUrl } from "./url";

type Plan = typeof schema.plan.$inferSelect;

/** Every Checkout session and subscription we create carries one of these. */
export type BillingMetadata =
  | { kind: "saas"; gymId: string }
  | { kind: "member"; gymId: string; memberId: string; planId: string };

function readMetadata(md: Stripe.Metadata | null | undefined): BillingMetadata | null {
  if (!md?.kind || !md.gymId) return null;
  if (md.kind === "saas") return { kind: "saas", gymId: md.gymId };
  if (md.kind === "member" && md.memberId && md.planId) {
    return { kind: "member", gymId: md.gymId, memberId: md.memberId, planId: md.planId };
  }
  return null;
}

function periodEnd(sub: Stripe.Subscription) {
  // Billing periods live on the items in current API versions.
  const end = sub.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : undefined;
}

// ---------------------------------------------------------------------------
// Layer 1: the gym pays Chalk
// ---------------------------------------------------------------------------

async function ensureGymCustomer(gym: Gym, email: string) {
  if (gym.stripeCustomerId) return gym.stripeCustomerId;
  const customer = await stripe().customers.create({ name: gym.name, email, metadata: { gymId: gym.id } });
  await db.update(schema.gym).set({ stripeCustomerId: customer.id }).where(eq(schema.gym.id, gym.id));
  return customer.id;
}

export async function startProCheckout(gym: Gym, ownerEmail: string) {
  const price = process.env.STRIPE_PRO_PRICE_ID;
  if (!price) throw new Error("STRIPE_PRO_PRICE_ID is not set. Run npm run stripe:setup.");
  const metadata: BillingMetadata = { kind: "saas", gymId: gym.id };
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await ensureGymCustomer(gym, ownerEmail),
    client_reference_id: gym.id,
    line_items: [{ price, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    success_url: appUrl(`/g/${gym.slug}/admin/settings/billing?checkout={CHECKOUT_SESSION_ID}`),
    cancel_url: appUrl(`/g/${gym.slug}/admin/settings/billing`),
  });
  return session.url!;
}

async function portalConfiguration() {
  const existing = await stripe().billingPortal.configurations.list({ active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await stripe().billingPortal.configurations.create({
    business_profile: { headline: "Manage your Chalk subscription" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  return created.id;
}

export async function billingPortalUrl(customerId: string, returnPath: string) {
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    configuration: await portalConfiguration(),
    return_url: appUrl(returnPath),
  });
  return session.url;
}

async function applySaasSubscription(gymId: string, sub: Stripe.Subscription) {
  const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  await db
    .update(schema.gym)
    .set({ saasPlan: active ? "pro" : "free", stripeSubscriptionId: active ? sub.id : null })
    .where(eq(schema.gym.id, gymId));
  await audit(gymId, null, active ? "billing.pro" : "billing.free", { subscription: sub.id, status: sub.status });
}

// ---------------------------------------------------------------------------
// Layer 2: members pay the gym (Stripe Connect, destination charges)
// ---------------------------------------------------------------------------

export class ConnectNotEnabledError extends Error {}

export async function connectOnboardingUrl(gym: Gym, ownerEmail: string) {
  let accountId = gym.stripeAccountId;
  if (!accountId) {
    try {
      const account = await stripe().accounts.create({
        type: "express",
        country: "US",
        email: ownerEmail,
        business_profile: { name: gym.name },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { gymId: gym.id },
      });
      accountId = account.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/connect/i.test(msg)) throw new ConnectNotEnabledError(msg);
      throw e;
    }
    await db.update(schema.gym).set({ stripeAccountId: accountId }).where(eq(schema.gym.id, gym.id));
  }
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl(`/g/${gym.slug}/admin/settings/billing?connect=refresh`),
    return_url: appUrl(`/g/${gym.slug}/admin/settings/billing?connect=return`),
  });
  return link.url;
}

export async function refreshConnectAccount(gym: Gym) {
  if (!gym.stripeAccountId) return false;
  const account = await stripe().accounts.retrieve(gym.stripeAccountId);
  await syncAccount(account);
  return Boolean(account.charges_enabled);
}

async function syncAccount(account: Stripe.Account) {
  await db
    .update(schema.gym)
    .set({ chargesEnabled: Boolean(account.charges_enabled) })
    .where(eq(schema.gym.stripeAccountId, account.id));
}

export async function connectDashboardUrl(gym: Gym) {
  if (!gym.stripeAccountId) return null;
  const link = await stripe().accounts.createLoginLink(gym.stripeAccountId);
  return link.url;
}

async function ensureMemberCustomer(member: MemberRow) {
  if (member.stripeCustomerId) return member.stripeCustomerId;
  const customer = await stripe().customers.create({
    name: member.name,
    email: member.email,
    metadata: { gymId: member.gymId, memberId: member.id },
  });
  await db.update(schema.member).set({ stripeCustomerId: customer.id }).where(eq(schema.member.id, member.id));
  return customer.id;
}

export function platformFee(amountCents: number) {
  return Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100);
}

export async function startMemberCheckout(gym: Gym, member: MemberRow, plan: Plan) {
  if (!gym.stripeAccountId || !gym.chargesEnabled) throw new Error("This gym can't take card payments yet");
  const metadata: BillingMetadata = { kind: "member", gymId: gym.id, memberId: member.id, planId: plan.id };
  const product_data = { name: `${gym.name}: ${plan.name}`, ...(plan.description ? { description: plan.description } : {}) };
  const urls = {
    success_url: appUrl(`/g/${gym.slug}/plans?checkout={CHECKOUT_SESSION_ID}`),
    cancel_url: appUrl(`/g/${gym.slug}/plans`),
  };
  const customer = await ensureMemberCustomer(member);

  const session =
    plan.kind === "monthly"
      ? await stripe().checkout.sessions.create({
          mode: "subscription",
          customer,
          metadata,
          line_items: [
            {
              quantity: 1,
              price_data: { currency: "usd", unit_amount: plan.priceCents, recurring: { interval: "month" }, product_data },
            },
          ],
          subscription_data: {
            metadata,
            application_fee_percent: PLATFORM_FEE_PERCENT,
            transfer_data: { destination: gym.stripeAccountId },
          },
          ...urls,
        })
      : await stripe().checkout.sessions.create({
          mode: "payment",
          customer,
          metadata,
          line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: plan.priceCents, product_data } }],
          payment_intent_data: {
            metadata,
            application_fee_amount: platformFee(plan.priceCents),
            transfer_data: { destination: gym.stripeAccountId },
          },
          ...urls,
        });
  return session.url!;
}

async function fulfillMemberCheckout(session: Stripe.Checkout.Session, md: Extract<BillingMetadata, { kind: "member" }>) {
  const plan = await db.query.plan.findFirst({
    where: and(eq(schema.plan.id, md.planId), eq(schema.plan.gymId, md.gymId)),
  });
  const member = await db.query.member.findFirst({
    where: and(eq(schema.member.id, md.memberId), eq(schema.member.gymId, md.gymId)),
  });
  if (!plan || !member) return null;

  let sub: Stripe.Subscription | null = null;
  if (session.subscription) {
    sub =
      typeof session.subscription === "string"
        ? await stripe().subscriptions.retrieve(session.subscription)
        : session.subscription;
  }
  const granted = await grantMembership(db, {
    gymId: md.gymId,
    memberId: member.id,
    plan,
    paidVia: "stripe",
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: sub?.id,
    periodEnd: sub ? periodEnd(sub) : undefined,
  });
  if (granted) {
    await audit(md.gymId, member.userId, "membership.purchased", {
      planId: plan.id,
      amount: session.amount_total,
      session: session.id,
    });
  }
  return granted;
}

async function applyMemberSubscription(sub: Stripe.Subscription) {
  const status =
    sub.status === "active" || sub.status === "trialing"
      ? "active"
      : sub.status === "past_due" || sub.status === "unpaid"
        ? "past_due"
        : sub.status === "canceled" || sub.status === "incomplete_expired"
          ? "cancelled"
          : null;
  if (!status) return;
  await db
    .update(schema.membership)
    .set({ status, ...(periodEnd(sub) ? { expiresAt: periodEnd(sub) } : {}) })
    .where(eq(schema.membership.stripeSubscriptionId, sub.id));
}

// ---------------------------------------------------------------------------
// Fulfilment: webhooks and the success redirect both land here
// ---------------------------------------------------------------------------

/** Apply a completed Checkout session. Idempotent; safe to call from both the webhook and the return page. */
export async function applyCheckoutSession(session: Stripe.Checkout.Session) {
  const md = readMetadata(session.metadata);
  if (!md) return null;
  const paid = session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
  if (!paid) return null;
  if (md.kind === "saas") {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subId) return null;
    await applySaasSubscription(md.gymId, await stripe().subscriptions.retrieve(subId));
    return md;
  }
  await fulfillMemberCheckout(session, md);
  return md;
}

/** Called by the success page so the purchase shows up even before the webhook arrives. */
export async function syncCheckoutById(sessionId: string, expectGymId: string) {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const md = readMetadata(session.metadata);
  if (!md || md.gymId !== expectGymId) return null;
  return applyCheckoutSession(session);
}

export async function handleStripeEvent(event: Stripe.Event) {
  // Each event is processed once, however many times Stripe delivers it.
  const [fresh] = await db
    .insert(schema.stripeEvent)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning();
  if (!fresh) return "duplicate";

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await applyCheckoutSession(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const md = readMetadata(sub.metadata);
        if (md?.kind === "saas") await applySaasSubscription(md.gymId, sub);
        else if (md?.kind === "member") await applyMemberSubscription(sub);
        break;
      }
      case "account.updated":
        await syncAccount(event.data.object);
        break;
    }
  } catch (e) {
    // Let Stripe retry: forget the event so the retry isn't skipped as a duplicate.
    await db.delete(schema.stripeEvent).where(eq(schema.stripeEvent.id, event.id));
    throw e;
  }
  return "processed";
}
