import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db, schema } from "@/db";
import { CoachSelect, TimingFields } from "@/components/class-fields";
import { ActionForm } from "@/components/form-bits";
import { Button, Card, EmptyState, Field, Input, PageTitle, SectionHeading } from "@/components/ui";
import { getCoaches } from "@/lib/classes";
import { GENERATE_DAYS } from "@/lib/schedule";
import { requireStaff } from "@/lib/tenant";
import { WEEKDAY_NAMES } from "@/lib/time";
import { createTemplates, deleteTemplate, generateNow } from "../actions";

export const metadata: Metadata = { title: "Weekly classes" };

// Monday first, like a gym's programming week.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function to12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export default async function TemplatesPage({ params }: PageProps<"/g/[slug]/admin/schedule/templates">) {
  const { slug } = await params;
  const { gym } = await requireStaff(slug);
  const [templates, coaches] = await Promise.all([
    db.query.classTemplate.findMany({
      where: and(eq(schema.classTemplate.gymId, gym.id), eq(schema.classTemplate.active, true)),
      orderBy: asc(schema.classTemplate.startTime),
    }),
    getCoaches(gym.id),
  ]);
  const coachName = new Map(coaches.map((c) => [c.id, c.name]));

  return (
    <>
      <Link href={`/g/${slug}/admin/schedule`} className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Schedule
      </Link>
      <div className="mt-3">
        <PageTitle sub={`Your repeating timetable. Classes are scheduled ${GENERATE_DAYS} days ahead and topped up nightly.`}>
          Weekly classes
        </PageTitle>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="flex flex-col gap-6">
          {templates.length === 0 && <EmptyState title="Blank whiteboard">Add your first repeating class on the right.</EmptyState>}
          {ORDER.map((wd) => {
            const list = templates.filter((t) => t.weekday === wd);
            if (!list.length) return null;
            return (
              <div key={wd}>
                <SectionHeading>{WEEKDAY_NAMES[wd]}</SectionHeading>
                <ul className="divide-y divide-line">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-baseline gap-3">
                        <span className="w-20 shrink-0 font-display text-xl font-bold">{to12h(t.startTime)}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{t.title}</span>
                          <span className="block truncate text-sm text-ink-soft">
                            {t.durationMin} min · {t.capacity} spots{t.coachId && coachName.get(t.coachId) ? ` · ${coachName.get(t.coachId)}` : ""}
                          </span>
                        </span>
                      </div>
                      <form action={deleteTemplate.bind(null, slug, t.id)}>
                        <Button size="sm" variant="ghost">
                          Remove
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <aside className="flex flex-col gap-6">
          <div>
            <SectionHeading>Add class</SectionHeading>
            <Card className="mt-4 p-4">
              <ActionForm action={createTemplates.bind(null, slug)} submit="Add to timetable">
                <Field label="Title">
                  <Input name="title" required placeholder="WOD" />
                </Field>
                <fieldset>
                  <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">Days</legend>
                  <div className="grid grid-cols-7 gap-1">
                    {ORDER.map((wd) => (
                      <label key={wd} className="relative">
                        <input type="checkbox" name="weekdays" value={wd} className="peer sr-only" defaultChecked={wd >= 1 && wd <= 5} />
                        <span className="flex h-12 cursor-pointer items-center justify-center rounded-sm border-2 border-line text-xs font-bold uppercase peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-blue">
                          {WEEKDAY_NAMES[wd].slice(0, 2)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <TimingFields />
                <CoachSelect coaches={coaches} />
              </ActionForm>
            </Card>
          </div>
          <Card className="p-4">
            <ActionForm action={generateNow.bind(null, slug)} submit="Fill schedule now">
              <p className="text-sm text-ink-soft">Added a class mid-week? Push it to the next {GENERATE_DAYS} days right away.</p>
            </ActionForm>
          </Card>
        </aside>
      </div>
    </>
  );
}
