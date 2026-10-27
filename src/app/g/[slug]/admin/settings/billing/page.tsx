import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Chip, cn, Notice, PageTitle, SectionHeading } from "@/components/ui";
import { refreshConnectAccount, syncCheckoutById } from "@/lib/billing";
import { activeMemberCount, FREE_MEMBER_LIMIT } from "@/lib/members";
import { PLATFORM_FEE_PERCENT, PRO_PRICE_CENTS, stripeConfigured } from "@/lib/stripe";
import { requireStaff } from "@/lib/tenant";
import { formatMoney } from "@/lib/utils";
import { manageBilling, openPayoutDashboard, setUpPayouts, upgrade } from "./actions";

export const metadata: Metadata = { title: "Billing" };

// The cached getGymBySlug would return the pre-sync row.
const freshGym = (id: string) => db.query.gym.findFirst({ where: eq(schema.gym.id, id) });

export default async function BillingPage({ params, searchParams }: PageProps<"/g/[slug]/admin/settings/billing">) {
  const { slug } = await params;
  const sp = await searchParams;
  let { gym } = await requireStaff(slug, ["owner"]);

  let notice: { tone: "green" | "yellow"; text: string } | null = null;
  if (stripeConfigured() && typeof sp.checkout === "string") {
    const r = await syncCheckoutById(sp.checkout, gym.id).catch(() => null);
    notice = r ? { tone: "green", text: "You're on Pro. Thanks for backing Chalk." } : { tone: "yellow", text: "Payment is still processing. This page will update shortly." };
  }
  if (stripeConfigured() && sp.connect === "return") {
    const enabled = await refreshConnectAccount(gym).catch(() => false);
    notice = enabled
      ? { tone: "green", text: "Payouts are live. Members can now pay by card." }
      : { tone: "yellow", text: "Stripe still needs a few details before you can take payments." };
  }
  if (notice) gym = (await freshGym(gym.id)) ?? gym;
  const members = await activeMemberCount(gym.id);
  const pct = Math.min(100, Math.round((members / FREE_MEMBER_LIMIT) * 100));
  const pro = gym.saasPlan === "pro";

  return (
    <>
      <Link href={`/g/${slug}/admin/settings`} className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Settings
      </Link>
      <div className="mt-3">
        <PageTitle sub="Stripe test mode. Use card 4242 4242 4242 4242, any future date, any CVC.">Billing</PageTitle>
      </div>
      {notice && (
        <div className="mb-6">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      {!stripeConfigured() && (
        <div className="mb-6">
          <Notice tone="yellow">Stripe keys aren&apos;t set on this server, so payments are switched off.</Notice>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeading>Your Chalk plan</SectionHeading>
          <Card className={cn("mt-4 p-5", pro && "border-2 border-ink")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-4xl font-extrabold uppercase leading-none">{pro ? "Pro" : "Free"}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {pro ? `${formatMoney(PRO_PRICE_CENTS)} / month · unlimited members` : `Up to ${FREE_MEMBER_LIMIT} active members`}
                </p>
              </div>
              <Chip tone={pro ? "green" : "neutral"}>{pro ? "Active" : "Current"}</Chip>
            </div>
            {!pro && (
              <div className="mt-5">
                <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  <span>Members</span>
                  <span className={members >= FREE_MEMBER_LIMIT ? "text-red" : ""}>
                    {members} / {FREE_MEMBER_LIMIT}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-0.5" aria-hidden>
                  {Array.from({ length: FREE_MEMBER_LIMIT }, (_, i) => (
                    <span key={i} className={cn("h-4 flex-1", i < members ? (pct >= 90 ? "bg-red" : "bg-ink") : "border border-line")} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6">
              {pro ? (
                <ActionButton action={manageBilling.bind(null, slug)} variant="secondary">
                  Manage subscription
                </ActionButton>
              ) : (
                <ActionButton action={upgrade.bind(null, slug)}>Upgrade to Pro · {formatMoney(PRO_PRICE_CENTS)}/mo</ActionButton>
              )}
            </div>
          </Card>
        </section>

        <section>
          <SectionHeading>Payouts</SectionHeading>
          <Card className="mt-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-4xl font-extrabold uppercase leading-none">Card payments</p>
              <Chip tone={gym.chargesEnabled ? "green" : gym.stripeAccountId ? "yellow" : "neutral"}>
                {gym.chargesEnabled ? "Live" : gym.stripeAccountId ? "Incomplete" : "Off"}
              </Chip>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              Members buy passes in the app and the money lands in your Stripe account. Chalk keeps {PLATFORM_FEE_PERCENT}%.
              Cash payments at the desk always work.
            </p>
            <div className="mt-6">
              {gym.chargesEnabled ? (
                <ActionButton action={openPayoutDashboard.bind(null, slug)} variant="secondary">
                  Open Stripe dashboard
                </ActionButton>
              ) : (
                <ActionButton action={setUpPayouts.bind(null, slug)}>
                  {gym.stripeAccountId ? "Finish Stripe setup" : "Set up payouts"}
                </ActionButton>
              )}
            </div>
          </Card>
        </section>
      </div>
    </>
  );
}
