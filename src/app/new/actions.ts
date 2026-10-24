"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { randomCode, slugify, type ActionState } from "@/lib/utils";

const gymSchema = z.object({
  name: z.string().trim().min(2, "Name your gym").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,40}$/, "Use 3–40 lowercase letters, numbers or dashes"),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", {
    message: "Pick a timezone",
  }),
});

const RESERVED = new Set(["admin", "api", "new", "home", "sign-in", "sign-up", "invite"]);

const starterPlans = [
  {
    name: "Unlimited",
    kind: "monthly" as const,
    priceCents: 15000,
    credits: null,
    validDays: null,
    description: "Every class, every day. Billed monthly.",
  },
  {
    name: "10-class pack",
    kind: "pack" as const,
    priceCents: 18000,
    credits: 10,
    validDays: 90,
    description: "Ten classes to use within 90 days.",
  },
  {
    name: "Drop-in",
    kind: "dropin" as const,
    priceCents: 2500,
    credits: 1,
    validDays: 30,
    description: "One class. Visiting athletes welcome.",
  },
];

export async function createGym(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("/new");
  const parsed = gymSchema.safeParse({
    name: form.get("name"),
    slug: form.get("slug") || slugify(String(form.get("name") ?? "")),
    timezone: form.get("timezone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, slug, timezone } = parsed.data;
  if (RESERVED.has(slug)) return { error: "That address is reserved. Try another." };
  const taken = await db.query.gym.findFirst({ where: eq(schema.gym.slug, slug), columns: { id: true } });
  if (taken) return { error: `chalk.app/g/${slug} is taken. Try another.` };

  await db.transaction(async (tx) => {
    const [gym] = await tx.insert(schema.gym).values({ name, slug, timezone }).returning();
    await tx.insert(schema.staff).values({ gymId: gym.id, userId: user.id, role: "owner" });
    await tx.insert(schema.plan).values(starterPlans.map((p) => ({ ...p, gymId: gym.id })));
    // Owners usually train at their own box too.
    await tx.insert(schema.member).values({
      gymId: gym.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      checkinCode: randomCode(),
    });
    await audit(gym.id, user.id, "gym.created", { name, slug }, tx);
  });
  redirect(`/g/${slug}/admin?welcome=1`);
}
