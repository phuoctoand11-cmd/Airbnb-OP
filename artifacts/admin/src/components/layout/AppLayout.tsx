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
    { href: "/import-airbnb", label: t.nav.importAirbnb, icon: Upload, permission: "manageFinance" },
    { href: "/performance", label: t.nav.performance, icon: BarChart2, permission: "viewPerformance" },
    { href: "/chat", label: t.nav.chat, icon: MessageSquare },
    { href: "/activity-logs", label: t.nav.activityLogs, icon: History, permission: "viewActivityLogs" },
    { href: "/settings/users", label: t.nav.team, icon: Settings, permission: "manageUsers" },
  ];

  const visibleNav = NAV_ITEMS.filter((n) => {
    if (role === "collaborator") {
      return n.href === "/listings" || n.href === "/calendar";
    }
    return !n.permission || hasPermission(role, n.permission);
  });

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
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-[#dddddd] bg-white transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="shrink-0 border-b border-[#dddddd]">
          <div className="flex h-16 items-center gap-3 px-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff385c]">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[#222222] leading-tight">
                Airbnb Ops
              </div>
              <div className="text-[11px] text-[#6a6a6a] leading-none mt-0.5">
                {t.nav.operationsCockpit}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <ul className="space-y-0.5">
            {visibleNav.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/dashboard" && location.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <div
                      className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition-all duration-100 ${
                        isActive
                          ? "bg-[#fff0f2] text-[#222222] font-semibold"
                          : "text-[#6a6a6a] font-normal hover:bg-[#f7f7f7] hover:text-[#222222]"
                      }`}
                    >
                      {/* Rausch left accent for active item */}
                      {isActive && (
                        <span
                          className="absolute inset-y-1 left-0 w-[3px] rounded-r-full"
                          style={{ background: "#ff385c" }}
                        />
                      )}
                      <item.icon
                        className={`h-4 w-4 shrink-0 ${isActive ? "text-[#ff385c]" : "text-[#929292]"}`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer controls */}
        <div className="border-t border-[#dddddd]">
          {/* Currency toggle */}
          <div className="flex items-center justify-between border-b border-[#ebebeb] px-4 py-2.5">
            <span className="text-[11px] font-semibold text-[#6a6a6a]">Currency</span>
            <div className="flex overflow-hidden rounded-full border border-[#dddddd] text-[11px] font-semibold">
              {(["VND", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1 transition-colors ${
                    currency === c
                      ? "bg-[#ff385c] text-white"
                      : "text-[#6a6a6a] hover:text-[#222222]"
                  }`}
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
                className="w-full justify-start rounded-none px-4 py-2.5 text-[13px] text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222] border-b border-[#ebebeb] h-auto"
              >
                <span className="mr-2 text-sm">{currentLangOption.flag}</span>
                {currentLangOption.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {LANG_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setLang(opt.value)}
                  className={`text-[13px] ${lang === opt.value ? "font-semibold" : ""}`}
                >
                  <span className="mr-2 text-sm">{opt.flag}</span>
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
                className="h-auto w-full justify-start rounded-none px-4 py-3 hover:bg-[#f7f7f7]"
              >
                <div className="flex w-full items-center gap-3 overflow-hidden text-left">
                  <Avatar className="h-8 w-8 rounded-full border border-[#dddddd]">
                    <AvatarImage src={profile?.avatar_url ?? ""} />
                    <AvatarFallback className="rounded-full bg-[#ff385c] text-white text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#222222]">
                      {profile?.full_name ?? profile?.email ?? "User"}
                    </p>
                    {role && (
                      <Badge
                        variant="outline"
                        className="mt-0.5 rounded-full px-2 py-0 text-[10px] font-semibold border-[#dddddd] text-[#6a6a6a]"
                      >
                        {t.roles[role] ?? role}
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
                className="cursor-pointer text-destructive focus:text-destructive text-[13px]"
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#dddddd] bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-full text-[#6a6a6a] hover:text-[#222222] hover:bg-[#f7f7f7]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-[16px] font-semibold text-[#222222]">{title}</h1>
          </div>
          {action && <div className="ml-4">{action}</div>}
        </header>

        {/* Block-error banner */}
        {blockError && !warningDismissed && (
          <div className="flex items-center gap-3 border-b border-[#ffd1da] bg-[#fff0f2] px-4 py-2 text-sm text-[#c13515]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{blockError}</span>
            <button
              onClick={() => setWarningDismissed(true)}
              className="ml-auto p-0.5 hover:text-[#222222]"
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
          <main className="flex-1 overflow-y-auto bg-[#f7f7f7] p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        )}
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Auth debug panel ─────────────────────────────────────────────── */}
      <div className="fixed bottom-3 right-3 z-50">
        {debugOpen ? (
          <div className="w-72 rounded-xl border border-[#dddddd] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#ebebeb] px-3 py-2">
              <span className="text-[11px] font-semibold text-[#6a6a6a]">Auth Debug</span>
              <button
                onClick={() => setDebugOpen(false)}
                className="p-0.5 text-[#929292] hover:text-[#222222]"
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
            className="rounded-full border border-[#dddddd] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#6a6a6a] shadow-sm hover:bg-[#f7f7f7]"
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
      <span className="w-32 shrink-0 text-[#929292]">{label}</span>
      <span className="min-w-0 break-all text-[#222222]">{value}</span>
    </div>
  );
}
