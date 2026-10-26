import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, dayKey, weekdayOfKey, zonedToUtc } from "./time";

export const GENERATE_DAYS = 14;

/**
 * Turn weekly templates into dated classes for the next GENERATE_DAYS days.
 * The unique (template_id, starts_at) index makes reruns a no-op.
 */
export async function generateClasses(gym: { id: string; timezone: string }, now = new Date(), days = GENERATE_DAYS) {
  const templates = await db.query.classTemplate.findMany({
    where: and(eq(schema.classTemplate.gymId, gym.id), eq(schema.classTemplate.active, true)),
  });
  const today = dayKey(now, gym.timezone);
  const rows: (typeof schema.classSession.$inferInsert)[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    const weekday = weekdayOfKey(day);
    for (const t of templates) {
      if (t.weekday !== weekday) continue;
      const startsAt = zonedToUtc(day, t.startTime, gym.timezone);
      if (startsAt <= now) continue;
      rows.push({
        gymId: gym.id,
        templateId: t.id,
        title: t.title,
        startsAt,
        durationMin: t.durationMin,
        capacity: t.capacity,
        coachId: t.coachId,
      });
    }
  }
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(schema.classSession)
    .values(rows)
    .onConflictDoNothing({ target: [schema.classSession.templateId, schema.classSession.startsAt] })
    .returning({ id: schema.classSession.id });
  return inserted.length;
}
