import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Building,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  CreditCard,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PieChart,
  Receipt,
  Settings,
  Users,
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

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  action?: ReactNode;
}

const LANG_OPTIONS: { value: Lang; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
];

export function AppLayout({ children, title, action }: AppLayoutProps) {
  const [location] = useLocation();
  const { profile, role, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    { href: "/chat", label: t.nav.chat, icon: MessageSquare },
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
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-none">Airbnb Ops</div>
            <div className="text-xs text-muted-foreground">{t.nav.operationsCockpit}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibleNav.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/dashboard" && location.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <div
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t p-3 space-y-2">
          {/* Language switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start px-2 text-muted-foreground">
                <span className="mr-2 text-base">{currentLangOption.flag}</span>
                {currentLangOption.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {LANG_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setLang(opt.value)}
                  className={lang === opt.value ? "font-semibold text-primary" : ""}
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
              <Button variant="ghost" className="h-auto w-full justify-start px-2 py-2">
                <div className="flex w-full items-center gap-3 overflow-hidden text-left">
                  <Avatar className="h-9 w-9 border">
                    <AvatarImage src={profile?.avatar_url ?? ""} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {profile?.full_name ?? profile?.email ?? "User"}
                    </p>
                    <div className="flex items-center gap-1">
                      {role && (
                        <Badge variant="outline" className="px-1 py-0 text-[10px] capitalize">
                          {ROLE_LABELS[role] ?? role}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{profile?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t.nav.signOut}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
          {action && <div className="ml-4">{action}</div>}
        </header>

        <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
