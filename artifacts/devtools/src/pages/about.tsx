import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tools } from "@/lib/tools";

const TECH = [
  { name: "React 18", desc: "UI library" },
  { name: "Vite", desc: "Build tool" },
  { name: "Tailwind CSS", desc: "Styling" },
  { name: "shadcn/ui", desc: "Component library" },
  { name: "Wouter", desc: "Client-side routing" },
  { name: "lucide-react", desc: "Icons" },
];

const TOOL_DEPS: { name: string; used: string }[] = [
  { name: "uuid",        used: "UUID Generator (v4 + v7)" },
  { name: "js-md5",      used: "Hash Generator (MD5)" },
  { name: "qrcode",      used: "QR Code Generator" },
  { name: "cronstrue",   used: "Cron Explainer" },
  { name: "cron-parser", used: "Cron next run times" },
  { name: "diff",        used: "Text Diff" },
  { name: "react-markdown + remark-gfm", used: "Markdown Preview" },
  { name: "Web Crypto API", used: "Hash Generator (SHA-*)  · built-in" },
];

export default function About() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">About</h1>
        <p className="text-muted-foreground mt-2">
          Developer Toolkit is a collection of {tools.length} browser-based utilities built for speed and privacy. All processing happens locally — nothing is sent to any server.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Principles</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2 text-sm text-muted-foreground">
          <p>All tools run entirely in your browser — no backend, no accounts, no data collection.</p>
          <p>The app works offline once loaded. No external fonts or remote resources are fetched at runtime.</p>
          <p>The interface is intentionally minimal: no ads, no upsells, no distractions.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Stack</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-1">
              {TECH.map(({ name, desc }) => (
                <div key={name} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/30 text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Libraries Used</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-1">
              {TOOL_DEPS.map(({ name, used }) => (
                <div key={name} className="px-2 py-1.5 rounded hover:bg-muted/30">
                  <div className="text-sm font-mono font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">{used}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">All {tools.length} Tools</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {tools.map((t) => (
              <Badge key={t.id} variant="secondary" className="font-normal">{t.name}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
