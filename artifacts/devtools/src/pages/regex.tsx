import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface Match {
  value: string;
  index: number;
  groups?: Record<string, string | undefined>;
}

export default function RegexPage() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState({ g: true, i: false, m: false, s: false });
  const [testStr, setTestStr] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flagStr = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join("");

  const handleTest = () => {
    if (!pattern) return;
    try {
      const re = new RegExp(pattern, flagStr);
      const found: Match[] = [];
      if (flags.g) {
        let m;
        while ((m = re.exec(testStr)) !== null) {
          found.push({ value: m[0], index: m.index, groups: m.groups });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      } else {
        const m = re.exec(testStr);
        if (m) found.push({ value: m[0], index: m.index, groups: m.groups });
      }
      setMatches(found);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setMatches(null);
    }
  };

  const highlighted = (): React.ReactNode => {
    if (!matches || matches.length === 0 || !testStr) return testStr;
    const parts: React.ReactNode[] = [];
    let last = 0;
    const sorted = [...matches].sort((a, b) => a.index - b.index);
    for (const m of sorted) {
      if (m.index < last) continue;
      if (m.index > last) parts.push(<span key={`t-${last}`}>{testStr.slice(last, m.index)}</span>);
      parts.push(
        <mark key={`m-${m.index}`} className="bg-primary/30 text-foreground rounded-sm px-0.5">
          {m.value}
        </mark>
      );
      last = m.index + m.value.length;
    }
    if (last < testStr.length) parts.push(<span key="tail">{testStr.slice(last)}</span>);
    return parts;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Regex Tester</h1>
        <p className="text-muted-foreground mt-1">Test regular expressions against a string and see all matches.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Pattern</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="flex items-center border border-border rounded-md overflow-hidden font-mono bg-background">
                <span className="px-3 py-2 text-muted-foreground bg-muted/30 border-r border-border select-none">/</span>
                <Input
                  className="border-0 rounded-none focus-visible:ring-0 font-mono"
                  placeholder="pattern"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTest()}
                  data-testid="input-pattern"
                />
                <span className="px-2 py-2 text-muted-foreground bg-muted/30 border-l border-border select-none font-mono text-sm">{flagStr || "/"}</span>
              </div>
            </div>
            <Button onClick={handleTest} data-testid="btn-test">Test</Button>
          </div>
          <div className="flex flex-wrap gap-4">
            {(["g", "i", "m", "s"] as const).map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Switch
                  id={`flag-${f}`}
                  checked={flags[f]}
                  onCheckedChange={(v) => setFlags((prev) => ({ ...prev, [f]: v }))}
                  data-testid={`switch-flag-${f}`}
                />
                <Label htmlFor={`flag-${f}`} className="font-mono text-sm cursor-pointer">
                  {f} — {f === "g" ? "global" : f === "i" ? "case-insensitive" : f === "m" ? "multiline" : "dotAll"}
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-mono" data-testid="text-error">{error}</div>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium flex justify-between items-center">
            <span>Test String</span>
            {matches !== null && (
              <Badge variant={matches.length > 0 ? "default" : "secondary"} data-testid="text-match-count">
                {matches.length} match{matches.length !== 1 ? "es" : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Textarea
            className="rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[120px]"
            placeholder="Enter test string here..."
            value={testStr}
            onChange={(e) => setTestStr(e.target.value)}
            data-testid="input-test-string"
            spellCheck={false}
          />
        </CardContent>
      </Card>

      {matches !== null && (
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Matches Highlighted</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="font-mono text-sm whitespace-pre-wrap break-all leading-relaxed" data-testid="output-highlighted">
              {testStr ? highlighted() : <span className="text-muted-foreground italic">No test string</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {matches && matches.length > 0 && (
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Match Details</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-1" data-testid="list-matches">
              {matches.map((m, i) => (
                <div key={i} data-testid={`match-item-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/20 font-mono text-sm">
                  <Badge variant="outline" className="text-xs min-w-0">#{i + 1}</Badge>
                  <span className="text-primary">{JSON.stringify(m.value)}</span>
                  <span className="text-muted-foreground text-xs ml-auto">index: {m.index}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
