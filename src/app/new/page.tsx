import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { GymForm } from "./gym-form";

export const metadata: Metadata = { title: "New gym" };

export default async function NewGymPage() {
  const user = await requireUser("/new");
  const timezones = ["UTC", ...Intl.supportedValuesOf("timeZone")];
  return (
    <>
      <TopBar userName={user.name} />
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <PageTitle sub="Free for up to 30 members. We'll add three starter plans you can edit.">
          Open your box
        </PageTitle>
        <GymForm timezones={timezones} />
      </main>
    </>
  );
}
