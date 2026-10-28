import { seedDemo } from "@/lib/demo";
import { runDaily } from "@/lib/jobs";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const daily = await runDaily();
  // The public demo starts every day from the same seeded state.
  const demo = process.env.DEMO_MODE === "1" ? await seedDemo() : null;
  return Response.json({ ...daily, demo });
}
