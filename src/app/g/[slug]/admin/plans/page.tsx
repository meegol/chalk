import { and, asc, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/form-bits";
import { Button, Card, Chip, PageTitle, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/tenant";
import { formatMoney } from "@/lib/utils";
import { createPlan, togglePlan, updatePlan } from "./actions";
import { PlanFields } from "./plan-fields";

export const metadata: Metadata = { title: "Plans" };

const kindLabel = { monthly: "Monthly", pack: "Class pack", dropin: "Drop-in" };

export default async function PlansPage({ params }: PageProps<"/g/[slug]/admin/plans">) {
  const { slug } = await params;
  const { gym, staff } = await requireStaff(slug);
  const isOwner = staff.role === "owner";
  const [plans, sold] = await Promise.all([
    db.query.plan.findMany({
      where: eq(schema.plan.gymId, gym.id),
      orderBy: asc(schema.plan.priceCents),
    }),
    db
      .select({ planId: schema.membership.planId, n: count() })
      .from(schema.membership)
      .where(and(eq(schema.membership.gymId, gym.id), eq(schema.membership.status, "active")))
      .groupBy(schema.membership.planId),
  ]);
  const soldBy = new Map(sold.map((s) => [s.planId, s.n]));
  plans.sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <>
      <PageTitle sub="What members can buy. Price changes apply to new purchases only.">Plans</PageTitle>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} className={p.active ? "border-2 border-ink" : "opacity-60"}>
              <div className="border-b border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-2xl font-extrabold uppercase leading-none">{p.name}</p>
                  <Chip tone={p.active ? "green" : "neutral"}>{p.active ? kindLabel[p.kind] : "Archived"}</Chip>
                </div>
                <p className="mt-3 font-display text-4xl font-bold">
                  {formatMoney(p.priceCents)}
                  {p.kind === "monthly" && <span className="text-base font-semibold text-ink-soft"> / month</span>}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {p.kind === "monthly"
                    ? "Unlimited classes"
                    : `${p.credits} class${p.credits === 1 ? "" : "es"} · valid ${p.validDays} days`}
                  {" · "}
                  {soldBy.get(p.id) ?? 0} active
                </p>
                {p.description && <p className="mt-2 text-sm">{p.description}</p>}
              </div>
              {isOwner && (
                <details className="group p-4">
                  <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-blue">
                    Edit plan
                  </summary>
                  <div className="mt-4 flex flex-col gap-4">
                    <ActionForm action={updatePlan.bind(null, slug, p.id)} submit="Save changes">
                      <PlanFields defaults={p} />
                    </ActionForm>
                    <form action={togglePlan.bind(null, slug, p.id, !p.active)}>
                      <Button variant={p.active ? "danger" : "secondary"} size="sm" className="w-full">
                        {p.active ? "Archive plan" : "Restore plan"}
                      </Button>
                    </form>
                  </div>
                </details>
              )}
            </Card>
          ))}
        </section>
        {isOwner && (
          <aside>
            <SectionHeading>New plan</SectionHeading>
            <Card className="mt-4 p-4">
              <ActionForm action={createPlan.bind(null, slug)} submit="Create plan">
                <PlanFields />
              </ActionForm>
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
