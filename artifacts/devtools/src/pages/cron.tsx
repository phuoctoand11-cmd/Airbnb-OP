import { useState } from "react";
import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, CalendarDays, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EXAMPLES = [
  { expr: "* * * * *",       desc: "Every minute" },
  { expr: "0 * * * *",       desc: "Every hour" },
  { expr: "0 0 * * *",       desc: "Every day at midnight" },
  { expr: "0 9 * * 1",       desc: "Every Monday at 9am" },
  { expr: "0 0 1 * *",       desc: "First day of every month" },
  { expr: "*/15 * * * *",    desc: "Every 15 minutes" },
  { expr: "0 9-17 * * 1-5",  desc: "Every hour 9am–5pm on weekdays" },
  { expr: "30 2 * * 0",      desc: "Sundays at 2:30am" },
];

function getNextRuns(expr: string, count = 5): Date[] | null {
  try {
    const interval = CronExpressionParser.parse(expr, { tz: "UTC" });
    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      dates.push(interval.next().toDate());
    }
    return dates;
  } catch {
    return null;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZoneName: "short",
  });
}

export default function Cron() {
  const [input, setInput] = useState("0 9 * * 1-5");
  const [result, setResult] = useState<string | null>(null);
  const [nextRuns, setNextRuns] = useState<Date[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const explain = (expr = input) => {
    if (!expr.trim()) return;
    try {
      const text = cronstrue.toString(expr.trim(), { throwExceptionOnParseError: true });
      setResult(text);
      setNextRuns(getNextRuns(expr.trim()));
      setError(null);
    } catch (err) {
      setError(String(err).replace("Error: ", ""));
      setResult(null);
      setNextRuns(null);
    }
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    toast({ title: "Copied", description: "Explanation copied to clipboard." });
  };

  const useExample = (expr: string) => {
    setInput(expr);
    explain(expr);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cron Explainer</h1>
        <p className="text-muted-foreground mt-1">Translate cron expressions into plain English and preview next run times.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Cron Expression</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. 0 9 * * 1-5"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && explain()}
              className="font-mono text-base"
              data-testid="input-cron"
            />
            <Button onClick={() => explain()} data-testid="btn-explain">
              <CalendarDays className="h-4 w-4 mr-1" /> Explain
            </Button>
          </div>
          <div className="text-xs text-muted-foreground font-mono flex gap-4 flex-wrap pt-1">
            <span>min</span><span>hour</span><span>day(month)</span><span>month</span><span>day(week)</span>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-mono" data-testid="text-error">{error}</div>
      )}

      {result && (
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Explanation</span>
              <Button variant="ghost" size="sm" onClick={copy} data-testid="btn-copy">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 bg-muted/10">
            <p className="text-base font-medium" data-testid="output-explanation">{result}</p>
          </CardContent>
        </Card>
      )}

      {nextRuns && nextRuns.length > 0 && (
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Next 5 Run Times (UTC)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ol className="space-y-1" data-testid="list-next-runs">
              {nextRuns.map((d, i) => (
                <li key={i} data-testid={`next-run-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/30 text-sm font-mono">
                  <span className="text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
                  <span>{formatDate(d)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Common Examples</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-1" data-testid="list-examples">
            {EXAMPLES.map(({ expr, desc }) => (
              <button
                key={expr}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/40 text-left transition-colors group"
                onClick={() => useExample(expr)}
                data-testid={`btn-example-${expr.replace(/\s+/g, "-")}`}
              >
                <code className="font-mono text-sm text-primary">{expr}</code>
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{desc}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
