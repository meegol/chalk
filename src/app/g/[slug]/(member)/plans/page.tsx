import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { ActionButton } from "@/components/action-button";
import { Card, Chip, Notice, SectionHeading } from "@/components/ui";
import { syncCheckoutById } from "@/lib/billing";
import { describeMembership, getMemberMemberships } from "@/lib/memberships";
import { stripeConfigured } from "@/lib/stripe";
import { requireMember } from "@/lib/tenant";
import { formatDateTime } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { buyPlan } from "./actions";

export const metadata: Metadata = { title: "Plans" };

export default async function MemberPlans({ params, searchParams }: PageProps<"/g/[slug]/plans">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { gym, member } = await requireMember(slug);

  let justBought = false;
  if (stripeConfigured() && typeof sp.checkout === "string") {
    justBought = Boolean(await syncCheckoutById(sp.checkout, gym.id).catch(() => null));
  }

  const [plans, memberships] = await Promise.all([
    db.query.plan.findMany({
      where: and(eq(schema.plan.gymId, gym.id), eq(schema.plan.active, true)),
      orderBy: asc(schema.plan.priceCents),
    }),
    getMemberMemberships(member.id),
  ]);
  const now = new Date();
  const current = memberships.filter(({ membership, plan }) => describeMembership(membership, plan, now).usable);

  return (
    <div className="flex flex-col gap-10">
      {justBought && <Notice tone="green">Payment received. You&apos;re good to book.</Notice>}

      <section>
        <SectionHeading>Your pass</SectionHeading>
        {current.length === 0 ? (
          <p className="mt-4 text-ink-soft">No active pass. Pick one below or pay at the desk.</p>
        ) : (
          <ul className="divide-y divide-line">
            {current.map(({ membership: m, plan }) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-bold">{plan.name}</p>
                  <p className="text-sm text-ink-soft">
                    {m.expiresAt ? `${plan.kind === "monthly" ? "Renews" : "Valid until"} ${formatDateTime(m.expiresAt, gym.timezone)}` : "No expiry"}
                  </p>
                </div>
                <Chip tone="green">{describeMembership(m, plan, now).label}</Chip>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading>Plans</SectionHeading>
        {!gym.chargesEnabled && (
          <div className="mt-4">
            <Notice tone="yellow">{gym.name} takes payment at the front desk for now. Show this page to the coach.</Notice>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3">
          {plans.map((p) => (
            <Card key={p.id} className="border-2 border-ink p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-3xl font-extrabold uppercase leading-none">{p.name}</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {p.kind === "monthly" ? "Unlimited classes" : `${p.credits} class${p.credits === 1 ? "" : "es"} · ${p.validDays} days`}
                  </p>
                </div>
                <p className="shrink-0 font-display text-3xl font-bold">
                  {formatMoney(p.priceCents)}
                  {p.kind === "monthly" && <span className="text-sm text-ink-soft">/mo</span>}
                </p>
              </div>
              {p.description && <p className="mt-3 text-sm">{p.description}</p>}
              {gym.chargesEnabled && (
                <div className="mt-4 [&_button]:w-full">
                  <ActionButton action={buyPlan.bind(null, slug, p.id)}>
                    {p.kind === "monthly" ? "Subscribe" : "Buy"}
                  </ActionButton>
                </div>
              )}
            </Card>
          ))}
        </div>
        {gym.chargesEnabled && <p className="mt-3 text-xs text-ink-soft">Test mode: pay with 4242 4242 4242 4242.</p>}
      </section>
    </div>
  );
}
