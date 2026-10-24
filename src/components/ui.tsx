import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-sm font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper border-2 border-ink hover:bg-ink/85",
  secondary: "bg-surface text-ink border-2 border-ink hover:bg-paper",
  ghost: "text-ink border-2 border-transparent hover:border-line",
  danger: "bg-surface text-red border-2 border-red hover:bg-red hover:text-paper",
};

const buttonSizes: Record<ButtonSize, string> = {
  md: "h-12 px-5 text-sm",
  sm: "h-9 px-3 text-xs",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}

const fieldClass =
  "h-12 w-full rounded-sm border border-line bg-surface px-3 text-ink placeholder:text-ink-soft/70 focus:border-ink";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClass, "appearance-auto", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "h-auto min-h-24 py-2", className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-sm border border-line bg-surface", className)} {...props} />;
}

/** Whiteboard-style heading: display type sitting on a thick ink rule. */
export function SectionHeading({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 border-b-4 border-ink pb-1", className)}>
      <h2 className="font-display text-2xl font-extrabold uppercase leading-none tracking-wide">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-4xl font-extrabold uppercase leading-none tracking-wide sm:text-5xl">
        {children}
      </h1>
      {sub && <p className="mt-2 text-ink-soft">{sub}</p>}
    </div>
  );
}

type Tone = "green" | "yellow" | "red" | "blue" | "neutral";

const chipTones: Record<Tone, string> = {
  green: "border-green text-green",
  yellow: "border-yellow text-yellow",
  red: "border-red text-red",
  blue: "border-blue text-blue",
  neutral: "border-line text-ink-soft",
};

/** Status chip. Always carries a word so colour is never the only signal. */
export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-sm border-2 px-2 text-[11px] font-bold uppercase tracking-wider",
        chipTones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Capacity as a row of plate blocks; falls back to a count above 16 spots. */
export function SpotsMeter({ taken, capacity }: { taken: number; capacity: number }) {
  const left = Math.max(capacity - taken, 0);
  const tone = left === 0 ? "text-red" : left <= 3 ? "text-yellow" : "text-ink-soft";
  return (
    <div className="flex items-center gap-2" aria-label={`${taken} of ${capacity} spots taken`}>
      {capacity <= 16 && (
        <div className="flex gap-0.5" aria-hidden>
          {Array.from({ length: capacity }, (_, i) => (
            <span
              key={i}
              className={cn("h-3.5 w-1.5 rounded-[1px]", i < taken ? "bg-ink" : "border border-line")}
            />
          ))}
        </div>
      )}
      <span className={cn("text-xs font-semibold", tone)}>
        {left === 0 ? "Full" : `${left} left`}
      </span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sm border-2 border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-xl font-bold uppercase tracking-wide">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={cn("rounded-sm border-l-4 bg-surface px-4 py-3 text-sm", chipTones[tone])}>
      <div className="text-ink">{children}</div>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display font-extrabold uppercase tracking-wider", className)}>
      <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" aria-hidden>
        <rect x="1" y="7" width="4" height="10" rx="0.5" fill="currentColor" />
        <rect x="5.5" y="4" width="3" height="16" rx="0.5" fill="var(--plate-red)" />
        <rect x="8.5" y="11" width="7" height="2" fill="currentColor" />
        <rect x="15.5" y="4" width="3" height="16" rx="0.5" fill="var(--plate-red)" />
        <rect x="19" y="7" width="4" height="10" rx="0.5" fill="currentColor" />
      </svg>
      Chalk
    </span>
  );
}
