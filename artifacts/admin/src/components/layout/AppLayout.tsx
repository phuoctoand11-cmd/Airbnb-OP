import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  BarChart2,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  CreditCard,
  History,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PieChart,
  Receipt,
  Settings,
  Upload,
  Users,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasPermission, type Permission, useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/supabase";
import { useI18n, type Lang } from "@/i18n";
import { useCurrency, type Currency } from "@/lib/currency";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  action?: ReactNode;
  /** Remove max-width cap and padding — for full-bleed pages like Chat */
  fullWidth?: boolean;
}

const LANG_OPTIONS: { value: Lang; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
];

export function AppLayout({ children, title, action, fullWidth }: AppLayoutProps) {
  const [location] = useLocation();
  const { profile, role, signOut, blockError, session, employee } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const NAV_ITEMS: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    permission?: Permission;
  }[] = [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard, permission: "viewDashboard" },
    { href: "/listings", label: t.nav.listings, icon: Home },
    { href: "/calendar", label: t.nav.availabilityCalendar, icon: CalendarRange, permission: "manageCalendar" },
    { href: "/bookings", label: t.nav.bookings, icon: CalendarDays, permission: "manageBookings" },
    { href: "/tasks", label: t.nav.tasks, icon: CheckSquare, permission: "manageTasks" },
    { href: "/reports", label: t.nav.reports, icon: PieChart, permission: "viewReports" },
    { href: "/hr", label: t.nav.hr, icon: Users, permission: "viewHR" },
    { href: "/revenues", label: t.nav.revenues, icon: CreditCard, permission: "manageFinance" },
    { href: "/expenses", label: t.nav.expenses, icon: Receipt, permission: "manageFinance" },
    { href: "/import-airbnb", label: "Nhập báo cáo Airbnb", icon: Upload, permission: "manageFinance" },
    { href: "/performance", label: t.nav.performance, icon: BarChart2, permission: "viewPerformance" },
    { href: "/chat", label: t.nav.chat, icon: MessageSquare },
    { href: "/activity-logs", label: t.nav.activityLogs, icon: History, permission: "viewActivityLogs" },
    { href: "/settings/users", label: t.nav.team, icon: Settings, permission: "manageUsers" },
  ];

  const visibleNav = NAV_ITEMS.filter((n) =>
    !n.permission || hasPermission(role, n.permission)
  );

  const initials = (profile?.full_name ?? profile?.email ?? "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const currentLangOption = LANG_OPTIONS.find((o) => o.value === lang) ?? LANG_OPTIONS[0];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)" }}
          >
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold leading-none tracking-tight text-white">
              Airbnb Ops
            </div>
            <div className="mt-0.5 text-[10px] font-medium tracking-widest text-white/30 uppercase">
              {t.nav.operationsCockpit}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {visibleNav.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/dashboard" && location.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <div
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "text-white shadow-lg"
                          : "text-white/50 hover:bg-white/5 hover:text-white/80"
                      }`}
                      style={isActive ? { background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)" } : {}}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer controls */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          {/* Currency toggle */}
          <div className="px-1 flex items-center gap-2 py-1">
            <span className="text-[10px] font-medium text-white/30 flex-1 uppercase tracking-widest">
              Currency
            </span>
            <div className="flex overflow-hidden rounded-lg border border-white/10 text-[11px] font-bold">
              {(["VND", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-2.5 py-1 transition-colors ${
                    currency === c
                      ? "text-white"
                      : "text-white/40 hover:text-white/70"
                  }`}
                  style={currency === c ? { background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)" } : {}}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Language switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start px-3 text-white/50 hover:bg-white/5 hover:text-white/80 rounded-xl"
              >
                <span className="mr-2 text-base">{currentLangOption.flag}</span>
                {currentLangOption.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {LANG_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setLang(opt.value)}
                  className={lang === opt.value ? "font-semibold" : ""}
                >
                  <span className="mr-2 text-base">{opt.flag}</span>
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start px-3 py-2 rounded-xl hover:bg-white/5"
              >
                <div className="flex w-full items-center gap-3 overflow-hidden text-left">
                  <Avatar className="h-7 w-7 border border-white/10">
                    <AvatarImage src={profile?.avatar_url ?? ""} />
                    <AvatarFallback
                      className="text-white text-xs font-bold"
                      style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)" }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/80">
                      {profile?.full_name ?? profile?.email ?? "User"}
                    </p>
                    {role && (
                      <Badge
                        variant="outline"
                        className="mt-0.5 px-1.5 py-0 text-[10px] font-medium capitalize border-white/10 text-white/30"
                      >
                        {ROLE_LABELS[role] ?? role}
                      </Badge>
                    )}
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                {profile?.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t.nav.signOut}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-xl text-white/60 hover:text-white hover:bg-white/5"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-sm font-bold tracking-tight text-foreground">{title}</h1>
          </div>
          {action && <div className="ml-4">{action}</div>}
        </header>

        {/* Block-error banner */}
        {blockError && !warningDismissed && (
          <div className="flex items-center gap-3 border-b border-amber-900/40 bg-amber-950/60 px-4 py-2 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="flex-1">{blockError}</span>
            <button
              onClick={() => setWarningDismissed(true)}
              className="ml-auto rounded-lg p-0.5 hover:bg-amber-900/40"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Page content */}
        {fullWidth ? (
          <main className="flex min-h-0 flex-1 overflow-hidden bg-background">
            {children}
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        )}
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Auth debug panel ─────────────────────────────────────────────── */}
      <div className="fixed bottom-3 right-3 z-50">
        {debugOpen ? (
          <div className="w-72 rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Auth Debug
              </span>
              <button
                onClick={() => setDebugOpen(false)}
                className="rounded-lg p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1 px-3 py-2 font-mono text-[11px]">
              <DebugRow label="session.user.id" value={session?.user?.id ?? "—"} />
              <DebugRow label="profile.email" value={profile?.email ?? "—"} />
              <DebugRow label="profile.role" value={profile?.role?.name ?? "—"} />
              <DebugRow label="employee.id" value={employee?.id ?? "—"} />
              <DebugRow label="employee.status" value={employee?.status ?? "—"} />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDebugOpen(true)}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold text-muted-foreground shadow-sm hover:bg-accent"
          >
            debug
          </button>
        )}
      </div>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-foreground">{value}</span>
    </div>
  );
}
