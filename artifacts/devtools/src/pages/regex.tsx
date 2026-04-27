import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Match {
  value: string;
  index: number;
  endIndex: number;
  numbered: (string | undefined)[];
  groups: Record<string, string | undefined>;
}

const CHEATSHEET: { pattern: string; description: string }[] = [
  { pattern: ".",      description: "Any character except newline" },
  { pattern: "\\d",   description: "Digit [0-9]" },
  { pattern: "\\D",   description: "Non-digit" },
  { pattern: "\\w",   description: "Word char [a-zA-Z0-9_]" },
  { pattern: "\\W",   description: "Non-word char" },
  { pattern: "\\s",   description: "Whitespace" },
  { pattern: "\\S",   description: "Non-whitespace" },
  { pattern: "^",     description: "Start of string (or line with m)" },
  { pattern: "$",     description: "End of string (or line with m)" },
  { pattern: "\\b",   description: "Word boundary" },
  { pattern: "*",     description: "0 or more (greedy)" },
  { pattern: "+",     description: "1 or more (greedy)" },
  { pattern: "?",     description: "0 or 1 (optional)" },
  { pattern: "{n,m}", description: "Between n and m occurrences" },
  { pattern: "*?",    description: "0 or more (lazy)" },
  { pattern: "+?",    description: "1 or more (lazy)" },
  { pattern: "[abc]", description: "Character class" },
  { pattern: "[^abc]", description: "Negated character class" },
  { pattern: "(abc)", description: "Capturing group" },
  { pattern: "(?:abc)", description: "Non-capturing group" },
  { pattern: "(?<name>abc)", description: "Named capturing group" },
  { pattern: "a|b",  description: "Alternation: a or b" },
  { pattern: "(?=abc)", description: "Positive lookahead" },
  { pattern: "(?!abc)", description: "Negative lookahead" },
];

function runRegex(pattern: string, flagStr: string, testStr: string): Match[] | null {
  if (!pattern) return null;
  try {
    const re = new RegExp(pattern, flagStr);
    const found: Match[] = [];
    if (flagStr.includes("g")) {
      let m: RegExpExecArray | null;
      let safety = 0;
      while ((m = re.exec(testStr)) !== null && safety++ < 500) {
        const groups: Record<string, string | undefined> = {};
        if (m.groups) Object.assign(groups, m.groups);
        found.push({ value: m[0], index: m.index, endIndex: m.index + m[0].length, numbered: [...m].slice(1), groups });
        if (m[0].length === 0) re.lastIndex++;
      }
    } else {
      const m = re.exec(testStr);
      if (m) {
        const groups: Record<string, string | undefined> = {};
        if (m.groups) Object.assign(groups, m.groups);
        found.push({ value: m[0], index: m.index, endIndex: m.index + m[0].length, numbered: [...m].slice(1), groups });
      }
    }
    return found;
  } catch {
    return null;
  }
}

function highlightMatches(testStr: string, matches: Match[]): React.ReactNode {
  if (!matches.length || !testStr) return testStr;
  const parts: React.ReactNode[] = [];
  let last = 0;
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  for (const m of sorted) {
    if (m.index < last) continue;
    if (m.index > last) parts.push(<span key={`t-${last}`}>{testStr.slice(last, m.index)}</span>);
    parts.push(
      <mark key={`m-${m.index}`} className="bg-primary/30 text-foreground rounded-sm px-0.5">
        {m.value || <span className="opacity-40">(empty)</span>}
      </mark>
    );
    last = m.endIndex || m.index + (m.value.length || 1);
  }
  if (last < testStr.length) parts.push(<span key="tail">{testStr.slice(last)}</span>);
  return parts;
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

  useEffect(() => {
    if (!pattern) {
      setMatches(null);
      setError(null);
      return;
    }
    try {
      new RegExp(pattern, flagStr);
      setError(null);
      const result = runRegex(pattern, flagStr, testStr);
      setMatches(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid regex");
      setMatches(null);
    }
  }, [pattern, flagStr, testStr]);

  const hasNamedGroups = matches?.some((m) => Object.keys(m.groups).length > 0) ?? false;
  const hasNumberedGroups = matches?.some((m) => m.numbered.length > 0) ?? false;
  const hasCaptureGroups = hasNamedGroups || hasNumberedGroups;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Regex Tester</h1>
        <p className="text-muted-foreground mt-1">Test regular expressions with live highlighting, capture groups, and a full cheatsheet.</p>
      </div>

      <Tabs defaultValue="tester">
        <TabsList>
          <TabsTrigger value="tester">Tester</TabsTrigger>
          <TabsTrigger value="cheatsheet">Cheatsheet</TabsTrigger>
        </TabsList>

        <TabsContent value="tester" className="mt-4 space-y-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium flex justify-between items-center">
                <span>Pattern</span>
                {matches !== null && !error && (
                  <Badge variant={matches.length > 0 ? "default" : "secondary"} data-testid="text-match-count">
                    {matches.length} match{matches.length !== 1 ? "es" : ""}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center border border-border rounded-md overflow-hidden font-mono bg-background">
                <span className="px-3 py-2 text-muted-foreground bg-muted/30 border-r border-border select-none">/</span>
                <Input
                  className="border-0 rounded-none focus-visible:ring-0 font-mono"
                  placeholder="pattern"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  data-testid="input-pattern"
                />
                <span className="px-2 py-2 text-muted-foreground bg-muted/30 border-l border-border select-none font-mono text-sm">/{flagStr}</span>
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
              <CardTitle className="text-sm font-medium">Test String</CardTitle>
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
                <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="font-mono text-sm whitespace-pre-wrap break-all leading-relaxed" data-testid="output-highlighted">
                  {testStr
                    ? highlightMatches(testStr, matches)
                    : <span className="text-muted-foreground italic">No test string</span>}
                </div>
              </CardContent>
            </Card>
          )}

          {matches && matches.length > 0 && (
            <Card className="border-border shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium">Match Details</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1" data-testid="list-matches">
                {matches.map((m, i) => (
                  <div key={i} data-testid={`match-item-${i}`} className="p-3 rounded-md bg-muted/20 space-y-1.5">
                    <div className="flex items-center gap-3 font-mono text-sm">
                      <Badge variant="outline" className="text-xs shrink-0">#{i + 1}</Badge>
                      <span className="text-primary">{JSON.stringify(m.value)}</span>
                      <span className="text-muted-foreground text-xs ml-auto">index {m.index}–{m.endIndex}</span>
                    </div>
                    {hasCaptureGroups && (
                      <div className="pl-8 space-y-0.5">
                        {m.numbered.map((v, gi) => (
                          <div key={gi} className="flex gap-2 text-xs font-mono" data-testid={`group-num-${i}-${gi}`}>
                            <span className="text-muted-foreground shrink-0">Group {gi + 1}:</span>
                            <span className={v === undefined ? "text-muted-foreground italic" : "text-amber-500 dark:text-amber-400"}>
                              {v === undefined ? "undefined" : JSON.stringify(v)}
                            </span>
                          </div>
                        ))}
                        {Object.entries(m.groups).map(([name, v]) => (
                          <div key={name} className="flex gap-2 text-xs font-mono" data-testid={`group-named-${i}-${name}`}>
                            <span className="text-muted-foreground shrink-0">?&lt;{name}&gt;:</span>
                            <span className={v === undefined ? "text-muted-foreground italic" : "text-green-500 dark:text-green-400"}>
                              {v === undefined ? "undefined" : JSON.stringify(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cheatsheet" className="mt-4">
          <Card className="border-border shadow-sm" data-testid="table-cheatsheet">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">Regex Quick Reference</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {CHEATSHEET.map(({ pattern, description }) => (
                  <div key={pattern} className="flex items-center px-4 py-2.5 gap-4 group hover:bg-muted/20">
                    <code
                      className="font-mono text-sm text-primary min-w-[110px] shrink-0 cursor-pointer"
                      onClick={() => setPattern(pattern)}
                      title="Click to use this pattern"
                    >
                      {pattern}
                    </code>
                    <span className="text-sm text-muted-foreground">{description}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground p-4 border-t border-border">
                Click any pattern to load it into the tester.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
