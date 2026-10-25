import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { CopyButton } from "@/components/copy-button";
import { ActionForm } from "@/components/form-bits";
import { Button, Card, Chip, Field, Input, PageTitle, SectionHeading, Select } from "@/components/ui";
import { requireStaff } from "@/lib/tenant";
import { formatDateTime } from "@/lib/time";
import { appUrl } from "@/lib/url";
import { inviteStaff, removeStaff, revokeInvite, updateGym } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/g/[slug]/admin/settings">) {
  const { slug } = await params;
  const { gym, staff: me } = await requireStaff(slug, ["owner"]);
  const [staff, invites, log] = await Promise.all([
    db
      .select({ staff: schema.staff, name: schema.user.name, email: schema.user.email })
      .from(schema.staff)
      .innerJoin(schema.user, eq(schema.user.id, schema.staff.userId))
      .where(eq(schema.staff.gymId, gym.id)),
    db.query.invite.findMany({
      where: and(eq(schema.invite.gymId, gym.id), isNull(schema.invite.acceptedAt), gt(schema.invite.expiresAt, new Date())),
      orderBy: desc(schema.invite.createdAt),
    }),
    db
      .select({ log: schema.auditLog, actor: schema.user.name })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorUserId))
      .where(eq(schema.auditLog.gymId, gym.id))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(15),
  ]);
  const timezones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

  return (
    <>
      <PageTitle>Settings</PageTitle>
      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <SectionHeading>Gym</SectionHeading>
          <Card className="mt-4 p-4">
            <ActionForm action={updateGym.bind(null, slug)} submit="Save">
              <Field label="Name">
                <Input name="name" defaultValue={gym.name} required />
              </Field>
              <Field label="Timezone">
                <Select name="timezone" defaultValue={gym.timezone}>
                  {timezones.map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Member signup link">
                <div className="flex gap-2">
                  <Input readOnly value={appUrl(`/g/${gym.slug}/join`)} className="font-mono text-sm" />
                  <CopyButton text={appUrl(`/g/${gym.slug}/join`)} label="Copy" />
                </div>
              </Field>
            </ActionForm>
          </Card>
        </section>

        <section>
          <SectionHeading>Coaches</SectionHeading>
          <ul className="mt-2 divide-y divide-line">
            {staff.map((s) => (
              <li key={s.staff.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-sm text-ink-soft">{s.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={s.staff.role === "owner" ? "blue" : "neutral"}>{s.staff.role}</Chip>
                  {s.staff.id !== me.id && s.staff.role === "coach" && (
                    <form action={removeStaff.bind(null, slug, s.staff.id)}>
                      <Button size="sm" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{inv.email}</p>
                  <p className="text-sm text-ink-soft">Invited · expires {formatDateTime(inv.expiresAt, gym.timezone)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton text={appUrl(`/invite/${inv.token}`)} />
                  <form action={revokeInvite.bind(null, slug, inv.id)}>
                    <Button size="sm" variant="ghost">
                      Revoke
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <Card className="mt-4 p-4">
            <ActionForm action={inviteStaff.bind(null, slug)} submit="Invite coach">
              <Field label="Coach email">
                <Input name="email" type="email" required />
              </Field>
            </ActionForm>
          </Card>
        </section>

        <section className="lg:col-span-2">
          <SectionHeading>Activity</SectionHeading>
          <ul className="mt-2 divide-y divide-line text-sm">
            {log.map(({ log: l, actor }) => (
              <li key={l.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="font-semibold">{actor ?? "System"}</span>{" "}
                  <span className="font-mono text-xs text-ink-soft">{l.action}</span>
                </span>
                <span className="text-ink-soft">{formatDateTime(l.createdAt, gym.timezone)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
