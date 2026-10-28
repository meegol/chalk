"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn, Input } from "@/components/ui";
import type { CheckinOutcome } from "./actions";

const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-paper/60">Starting camera…</div>,
});

type Member = { id: string; name: string; email: string };

export function CheckInDesk({
  members,
  action,
}: {
  members: Member[];
  action: (input: { code?: string; memberId?: string }) => Promise<CheckinOutcome>;
}) {
  const router = useRouter();
  const [result, setResult] = useState<CheckinOutcome | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const lastCode = useRef<{ code: string; at: number } | null>(null);

  // The banner clears itself so the desk is ready for the next athlete.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(t);
  }, [result]);

  function submit(input: { code?: string; memberId?: string }) {
    start(async () => {
      setResult(await action(input));
      setQuery("");
      router.refresh();
    });
  }

  function onScan(codes: { rawValue: string }[]) {
    const code = codes[0]?.rawValue;
    if (!code || pending) return;
    // Ignore the same QR held in front of the camera for a few seconds.
    const now = Date.now();
    if (lastCode.current && lastCode.current.code === code && now - lastCode.current.at < 5000) return;
    lastCode.current = { code, at: now };
    submit({ code });
  }

  const q = query.trim().toLowerCase();
  const matches = q.length >= 2 ? members.filter((m) => m.name.toLowerCase().includes(q) || m.email.includes(q)).slice(0, 6) : [];
  const looksLikeCode = /^[A-Z2-9]{10}$/i.test(query.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm border-2 border-ink bg-ink sm:aspect-video">
        {cameraOn ? (
          <Scanner onScan={onScan} onError={() => setCameraOn(false)} constraints={{ facingMode: "environment" }} sound={false} scanDelay={400} />
        ) : (
          <button onClick={() => setCameraOn(true)} className="flex h-full w-full flex-col items-center justify-center gap-2 text-paper">
            <span className="font-display text-3xl font-extrabold uppercase">Tap to scan</span>
            <span className="text-sm text-paper/60">Point the camera at the member&apos;s pass</span>
          </button>
        )}
        {result && (
          <div
            role="status"
            className={cn(
              "absolute inset-x-0 bottom-0 p-5",
              !result.ok ? "bg-red text-paper" : result.hadEntitlement ? "bg-green text-paper" : "bg-yellow text-ink",
            )}
          >
            {result.ok ? (
              <>
                <p className="font-display text-4xl font-extrabold uppercase leading-none">{result.name}</p>
                <p className="mt-1 font-semibold">
                  {!result.hadEntitlement
                    ? result.status !== "active"
                      ? `Membership ${result.status}. Check at the desk.`
                      : "No active pass. Take payment."
                    : result.classTitle
                      ? `Checked in for ${result.classTitle}`
                      : "Open gym. Have a good session."}
                </p>
              </>
            ) : (
              <p className="font-display text-3xl font-extrabold uppercase">{result.error}</p>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (looksLikeCode) submit({ code: query.trim() });
          else if (matches[0]) submit({ memberId: matches[0].id });
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="No phone? Search a name or type their code"
          aria-label="Search members"
          autoComplete="off"
        />
      </form>
      {matches.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => submit({ memberId: m.id })}
                disabled={pending}
                className="flex h-14 w-full items-center justify-between gap-3 px-2 text-left hover:bg-surface"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.name}</span>
                  <span className="block truncate text-xs text-ink-soft">{m.email}</span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-blue">Check in</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
