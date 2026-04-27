import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, Clock, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function formatDate(d: Date): string {
  return d.toUTCString();
}

export default function Timestamp() {
  const [now, setNow] = useState(Date.now());
  const [tsInput, setTsInput] = useState("");
  const [tsResult, setTsResult] = useState<{ utc: string; local: string; iso: string } | null>(null);
  const [tsError, setTsError] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState("");
  const [dateResult, setDateResult] = useState<{ seconds: string; millis: string } | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const convertTs = () => {
    if (!tsInput.trim()) return;
    const num = Number(tsInput.trim());
    if (isNaN(num)) {
      setTsError("Not a valid number");
      setTsResult(null);
      return;
    }
    const ms = num > 1e12 ? num : num * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) {
      setTsError("Invalid timestamp");
      setTsResult(null);
      return;
    }
    setTsError(null);
    setTsResult({
      utc: d.toUTCString(),
      local: d.toLocaleString(),
      iso: d.toISOString(),
    });
  };

  const convertDate = () => {
    if (!dateInput.trim()) return;
    const d = new Date(dateInput.trim());
    if (isNaN(d.getTime())) {
      setDateError("Invalid date: could not parse the date string");
      setDateResult(null);
      return;
    }
    setDateError(null);
    setDateResult({
      seconds: Math.floor(d.getTime() / 1000).toString(),
      millis: d.getTime().toString(),
    });
  };

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: "Copied", description: "Value copied to clipboard." });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Timestamp Converter</h1>
        <p className="text-muted-foreground mt-1">Convert between Unix timestamps and human-readable dates.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Current Unix Time</p>
              <p className="font-mono text-3xl font-bold" data-testid="text-current-ts">{Math.floor(now / 1000)}</p>
              <p className="font-mono text-sm text-muted-foreground mt-1">{new Date(now).toUTCString()}</p>
            </div>
            <Clock className="h-10 w-10 text-primary/40" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Timestamp to Date</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 1714176000 or 1714176000000"
                value={tsInput}
                onChange={(e) => setTsInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && convertTs()}
                className="font-mono"
                data-testid="input-timestamp"
              />
              <Button onClick={convertTs} data-testid="btn-convert-ts">Convert</Button>
            </div>
            {tsError && <p className="text-destructive text-sm" data-testid="text-ts-error">{tsError}</p>}
            {tsResult && (
              <div className="space-y-2">
                {[
                  { label: "UTC", value: tsResult.utc, id: "utc" },
                  { label: "Local", value: tsResult.local, id: "local" },
                  { label: "ISO 8601", value: tsResult.iso, id: "iso" },
                ].map(({ label, value, id }) => (
                  <div key={id} className="flex items-center justify-between p-2 rounded-md bg-muted/20">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase">{label}</span>
                      <p className="font-mono text-sm" data-testid={`output-${id}`}>{value}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(value)} data-testid={`btn-copy-${id}`}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Date to Timestamp</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 2024-04-27 or April 27, 2024"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && convertDate()}
                data-testid="input-date"
              />
              <Button onClick={convertDate} data-testid="btn-convert-date">Convert</Button>
            </div>
            {dateError && <p className="text-destructive text-sm" data-testid="text-date-error">{dateError}</p>}
            {dateResult && (
              <div className="space-y-2">
                {[
                  { label: "Seconds", value: dateResult.seconds, id: "seconds" },
                  { label: "Milliseconds", value: dateResult.millis, id: "millis" },
                ].map(({ label, value, id }) => (
                  <div key={id} className="flex items-center justify-between p-2 rounded-md bg-muted/20">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase">{label}</span>
                      <p className="font-mono text-sm" data-testid={`output-date-${id}`}>{value}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(value)} data-testid={`btn-copy-date-${id}`}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
