import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { tools } from "@/lib/tools";
import { Button } from "@/components/ui/button";
import { Menu, Moon, Sun, Info } from "lucide-react";
import { useTheme } from "../theme-context";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
        <h2 className="text-lg font-semibold tracking-tight">DevTools</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          data-testid="btn-toggle-theme"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <Link href="/">
          <div
            data-testid="nav-home"
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
              location === "/"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <span className="font-medium">Home</span>
          </div>
        </Link>
        <div className="pt-4 pb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
          Tools
        </div>
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = location === tool.path;
          return (
            <Link key={tool.path} href={tool.path}>
              <div
                data-testid={`nav-${tool.id}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{tool.name}</span>
              </div>
            </Link>
          );
        })}
        <div className="pt-4 pb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
          Info
        </div>
        <Link href="/about">
          <div
            data-testid="nav-about"
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
              location === "/about"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Info className="h-4 w-4" />
            <span className="text-sm font-medium">About</span>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="hidden md:block w-64 h-full shrink-0">
        <SidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-background">
          <h1 className="text-lg font-semibold">DevTools</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              data-testid="btn-toggle-theme-mobile"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="btn-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 border-r-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-5xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
