import { Link, useRouterState } from "@tanstack/react-router";
import { CandlestickChart, LayoutDashboard, ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", label: "Desk", icon: LayoutDashboard, exact: true },
  { to: "/chart", label: "Chart", icon: CandlestickChart, exact: false },
  { to: "/screener", label: "Screener", icon: ScanSearch, exact: false },
] as const;

/** Slim top navigation shared by the terminal pages (chart, screener). */
export function TermNav({ subtitle }: { subtitle?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex h-11 items-center gap-1 border-b border-border px-2 md:px-3">
      <Link to="/" className="mr-2 flex items-center gap-2">
        <span className="font-display text-lg leading-none">Vela</span>
        <span className="text-[10px] tracking-wider text-subtle uppercase">Terminal</span>
      </Link>
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.to : pathname.startsWith(l.to);
        return (
          <Link
            key={l.to}
            to={l.to}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs",
              active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
            )}
          >
            <l.icon className="size-3.5" />
            {l.label}
          </Link>
        );
      })}
      {subtitle ? (
        <span className="ml-3 hidden truncate text-[11px] text-subtle md:inline">{subtitle}</span>
      ) : null}
      <span className="ml-auto hidden text-[10px] text-subtle md:inline">
        Paper only — quá khứ không đảm bảo tương lai
      </span>
    </nav>
  );
}
