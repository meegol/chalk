import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { TopBar } from "@/components/top-bar";
import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { getViewer } from "@/lib/tenant";
import { formatMoney } from "@/lib/utils";
import { joinGym } from "./actions";
import { JoinButton } from "./join-button";

export default async function JoinPage({ params }: PageProps<"/g/[slug]/join">) {
  const { slug } = await params;
  const { user, gym, member } = await getViewer(slug);
  if (member) redirect(`/g/${slug}`);
  const plans = await db.query.plan.findMany({
    where: and(eq(schema.plan.gymId, gym.id), eq(schema.plan.active, true)),
    orderBy: asc(schema.plan.priceCents),
  });
  const next = `/g/${slug}/join`;

  return (
    <>
      <TopBar userName={user?.name} />
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <PageTitle sub="Book classes, buy a pass and check in from your phone.">{gym.name}</PageTitle>
        {user ? (
          <JoinButton action={joinGym.bind(null, slug)} />
        ) : (
          <div className="flex flex-col gap-3">
            <ButtonLink href={`/sign-up?next=${encodeURIComponent(next)}`}>Create account to join</ButtonLink>
            <ButtonLink variant="secondary" href={`/sign-in?next=${encodeURIComponent(next)}`}>
              Sign in
            </ButtonLink>
          </div>
        )}
        {plans.length > 0 && (
          <Card className="mt-8 divide-y divide-line">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  {p.description && <p className="text-sm text-ink-soft">{p.description}</p>}
                </div>
                <p className="font-display text-2xl font-bold">
                  {formatMoney(p.priceCents)}
                  {p.kind === "monthly" && <span className="text-sm text-ink-soft">/mo</span>}
                </p>
              </div>
            ))}
          </Card>
        )}
      </main>
    </>
  );
}
