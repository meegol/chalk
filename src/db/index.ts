import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

// Reuse one pool across hot reloads in dev. On Vercel each function instance
// keeps one connection, and prepared statements are off for Neon's pooler.
const client =
  globalForDb.pg ??
  postgres(process.env.DATABASE_URL!, { max: process.env.VERCEL ? 1 : 10, prepare: !process.env.VERCEL });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
