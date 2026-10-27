import type { Metadata } from "next";
import QRCode from "qrcode";
import { Chip } from "@/components/ui";
import { describeMembership, getMemberMemberships } from "@/lib/memberships";
import { requireMember } from "@/lib/tenant";

export const metadata: Metadata = { title: "Pass" };

export default async function PassPage({ params }: PageProps<"/g/[slug]/pass">) {
  const { slug } = await params;
  const { gym, member } = await requireMember(slug);
  const [svg, memberships] = await Promise.all([
    QRCode.toString(member.checkinCode, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1a1916", light: "#ffffff" } }),
    getMemberMemberships(member.id),
  ]);
  const now = new Date();
  const usable = memberships.find(({ membership, plan }) => describeMembership(membership, plan, now).usable);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">Show this at the front desk</p>
      {/* Always black on white so scanners read it in dark mode too. */}
      <div className="mt-4 w-full rounded-sm border-4 border-ink bg-white p-6">
        <div className="mx-auto aspect-square w-full max-w-64 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <p className="mt-4 font-display text-4xl font-extrabold uppercase leading-none">{member.name}</p>
      <p className="mt-2 font-mono text-lg tracking-[0.2em]">{member.checkinCode}</p>
      <div className="mt-4">
        {member.status !== "active" ? (
          <Chip tone="yellow">{member.status}</Chip>
        ) : usable ? (
          <Chip tone="green">{usable.plan.name} · {describeMembership(usable.membership, usable.plan, now).label}</Chip>
        ) : (
          <Chip tone="red">No active pass</Chip>
        )}
      </div>
      <p className="mt-6 text-sm text-ink-soft">{gym.name}</p>
    </div>
  );
}
