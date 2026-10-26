import { and, asc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/form-bits";
import { Button, Card, Chip, Field, Input, SectionHeading, Select, SpotsMeter } from "@/components/ui";
import { LATE_CANCEL_HOURS } from "@/lib/booking";
import { requireStaff } from "@/lib/tenant";
import { formatDateTime } from "@/lib/time";
import { cancelWholeClass, setAttendance, staffBook, staffCancel, updateCapacity } from "../actions";

const tone = { booked: "blue", attended: "green", no_show: "red", waitlisted: "yellow", late_cancel: "red", cancelled: "neutral" } as const;

export default async function ClassPage({ params }: PageProps<"/g/[slug]/admin/schedule/[classId]">) {
  const { slug, classId } = await params;
  const { gym } = await requireStaff(slug);
  const cls = await db.query.classSession.findFirst({
    where: and(eq(schema.classSession.id, classId), eq(schema.classSession.gymId, gym.id)),
  });
  if (!cls) notFound();

  const [rows, members] = await Promise.all([
    db
      .select({ booking: schema.booking, member: schema.member })
      .from(schema.booking)
      .innerJoin(schema.member, eq(schema.member.id, schema.booking.memberId))
      .where(eq(schema.booking.classSessionId, cls.id))
      .orderBy(asc(schema.booking.createdAt)),
    db.query.member.findMany({
      where: and(eq(schema.member.gymId, gym.id), ne(schema.member.status, "cancelled")),
      orderBy: asc(schema.member.name),
      columns: { id: true, name: true },
    }),
  ]);
  const now = new Date();
  const started = cls.startsAt <= now;
  const lateWindow = cls.startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * 3_600_000;
  const roster = rows.filter((r) => ["booked", "attended", "no_show"].includes(r.booking.status));
  const waitlist = rows.filter((r) => r.booking.status === "waitlisted");
  const dropped = rows.filter((r) => ["cancelled", "late_cancel"].includes(r.booking.status));
  const taken = roster.filter((r) => r.booking.status !== "no_show").length;
  const onList = new Set(rows.filter((r) => !["cancelled", "late_cancel"].includes(r.booking.status)).map((r) => r.member.id));

  return (
    <>
      <Link href={`/g/${slug}/admin/schedule`} className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Schedule
      </Link>
      <div className="mb-8 mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">{formatDateTime(cls.startsAt, gym.timezone)}</p>
          <h1 className="mt-1 font-display text-5xl font-extrabold uppercase leading-none">{cls.title}</h1>
          <div className="mt-3 flex items-center gap-3">
            <SpotsMeter taken={taken} capacity={cls.capacity} />
            {cls.cancelledAt && <Chip tone="red">Cancelled</Chip>}
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-8">
          <section>
            <SectionHeading>Roster · {roster.length}</SectionHeading>
            {roster.length === 0 && <p className="mt-4 text-sm text-ink-soft">Nobody booked yet.</p>}
            <ul className="divide-y divide-line">
              {roster.map(({ booking: b, member: m }) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <Link href={`/g/${slug}/admin/members/${m.id}`} className="min-w-0 font-semibold hover:underline">
                    {m.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={tone[b.status]}>{b.status.replace("_", " ")}</Chip>
                    {started ? (
                      <>
                        <form action={setAttendance.bind(null, slug, cls.id, b.id, true)}>
                          <Button size="sm" variant={b.status === "attended" ? "primary" : "secondary"}>Here</Button>
                        </form>
                        <form action={setAttendance.bind(null, slug, cls.id, b.id, false)}>
                          <Button size="sm" variant={b.status === "no_show" ? "danger" : "ghost"}>No-show</Button>
                        </form>
                      </>
                    ) : (
                      !cls.cancelledAt && (
                        <form action={staffCancel.bind(null, slug, cls.id, b.id, true)}>
                          <Button size="sm" variant="ghost" title="Cancels without the late-cancel penalty">
                            Remove{lateWindow ? " (refund)" : ""}
                          </Button>
                        </form>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {waitlist.length > 0 && (
            <section>
              <SectionHeading>Waitlist · {waitlist.length}</SectionHeading>
              <ol className="divide-y divide-line">
                {waitlist.map(({ booking: b, member: m }, i) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-3">
                    <span className="font-semibold">
                      <span className="mr-2 font-mono text-ink-soft">#{i + 1}</span>
                      {m.name}
                    </span>
                    {!started && (
                      <form action={staffCancel.bind(null, slug, cls.id, b.id, true)}>
                        <Button size="sm" variant="ghost">Remove</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {dropped.length > 0 && (
            <section>
              <SectionHeading>Dropped · {dropped.length}</SectionHeading>
              <ul className="divide-y divide-line">
                {dropped.map(({ booking: b, member: m }) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-3 text-ink-soft">
                    {m.name}
                    <Chip tone={tone[b.status]}>{b.status === "late_cancel" ? "Late cancel" : "Cancelled"}</Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {!cls.cancelledAt && !started && (
          <aside className="flex flex-col gap-6">
            <div>
              <SectionHeading>Add athlete</SectionHeading>
              <Card className="mt-4 p-4">
                <ActionForm action={staffBook.bind(null, slug, cls.id)} submit="Book">
                  <Field label="Member" hint="Uses their pass like a normal booking.">
                    <Select name="memberId" required defaultValue="">
                      <option value="" disabled>
                        Choose a member
                      </option>
                      {members
                        .filter((m) => !onList.has(m.id))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </ActionForm>
              </Card>
            </div>
            <div>
              <SectionHeading>Capacity</SectionHeading>
              <Card className="mt-4 p-4">
                <ActionForm action={updateCapacity.bind(null, slug, cls.id)} submit="Save" className="flex flex-col gap-3">
                  <Field label="Spots" hint="Raising it moves people off the waitlist.">
                    <Input name="capacity" type="number" inputMode="numeric" min={1} max={100} defaultValue={cls.capacity} />
                  </Field>
                </ActionForm>
              </Card>
            </div>
            <form action={cancelWholeClass.bind(null, slug, cls.id)}>
              <Button variant="danger" className="w-full">
                Cancel class & refund
              </Button>
            </form>
          </aside>
        )}
      </div>
    </>
  );
}
