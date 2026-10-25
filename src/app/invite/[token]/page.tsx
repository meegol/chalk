import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { TopBar } from "@/components/top-bar";
import { Button, ButtonLink, Notice, PageTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { acceptInvite } from "./actions";

export const metadata: Metadata = { title: "Invite" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getCurrentUser();
  const row = await db
    .select({ invite: schema.invite, gym: schema.gym })
    .from(schema.invite)
    .innerJoin(schema.gym, eq(schema.gym.id, schema.invite.gymId))
    .where(eq(schema.invite.token, token))
    .then((r) => r[0]);

  const invalid = !row || row.invite.acceptedAt || row.invite.expiresAt < new Date();
  const next = `/invite/${token}`;

  return (
    <>
      <TopBar userName={user?.name} />
      <main className="mx-auto w-full max-w-md px-4 py-12">
        {invalid ? (
          <>
            <PageTitle>Link expired</PageTitle>
            <p className="text-ink-soft">This invite was used or has expired. Ask the gym owner for a new one.</p>
          </>
        ) : (
          <>
            <PageTitle sub={`You've been invited to ${row.invite.role === "coach" ? "coach at" : "join"} this gym.`}>
              {row.gym.name}
            </PageTitle>
            {!user ? (
              <div className="flex flex-col gap-3">
                <ButtonLink href={`/sign-up?next=${encodeURIComponent(next)}&email=${encodeURIComponent(row.invite.email)}`}>
                  Create account
                </ButtonLink>
                <ButtonLink variant="secondary" href={`/sign-in?next=${encodeURIComponent(next)}`}>
                  I have an account
                </ButtonLink>
              </div>
            ) : user.email.toLowerCase() !== row.invite.email ? (
              <Notice tone="yellow">
                This invite is for {row.invite.email}, but you&apos;re signed in as {user.email}. Sign out and use the
                invited email.
              </Notice>
            ) : (
              <form action={acceptInvite.bind(null, token)}>
                <Button className="w-full">Accept invite</Button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
