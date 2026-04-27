import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

type UUIDVersion = "v4" | "v7";

export default function Uuid() {
  const [uuids, setUuids] = useState<string[]>([uuidv4()]);
  const [count, setCount] = useState(1);
  const [version, setVersion] = useState<UUIDVersion>("v4");
  const { toast } = useToast();

  const generate = () => {
    const n = Math.max(1, Math.min(100, count));
    setUuids(Array.from({ length: n }, () => version === "v4" ? uuidv4() : uuidv7()));
  };

  const copyOne = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: "Copied", description: "UUID copied to clipboard." });
  };

  const copyAll = () => {
    navigator.clipboard.writeText(uuids.join("\n"));
    toast({ title: "Copied", description: `${uuids.length} UUIDs copied to clipboard.` });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">UUID Generator</h1>
        <p className="text-muted-foreground mt-1">Generate v4 (random) and v7 (time-ordered) UUIDs.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Options</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex flex-wrap gap-6 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Version</Label>
            <div className="flex rounded-md border border-input overflow-hidden">
              {(["v4", "v7"] as UUIDVersion[]).map((v) => (
                <button
                  key={v}
                  data-testid={`btn-version-${v}`}
                  onClick={() => setVersion(v)}
                  className={`px-4 py-1.5 text-sm font-mono transition-colors ${
                    version === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uuid-count" className="text-xs">Count (1–100)</Label>
            <Input
              id="uuid-count"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              className="w-24 font-mono"
              data-testid="input-count"
            />
          </div>
          <Button onClick={generate} data-testid="btn-generate">
            <RefreshCw className="h-4 w-4 mr-1" /> Generate
          </Button>
          {uuids.length > 1 && (
            <Button variant="outline" onClick={copyAll} data-testid="btn-copy-all">
              <Copy className="h-4 w-4 mr-1" /> Copy All
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Generated UUIDs
            <Badge variant="secondary" className="font-mono text-[10px]">{version.toUpperCase()}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <div className="space-y-1" data-testid="list-uuids">
            {uuids.map((id, i) => (
              <div
                key={id}
                data-testid={`uuid-item-${i}`}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/40 group"
              >
                <span className="font-mono text-sm text-foreground">{id}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyOne(id)}
                  data-testid={`btn-copy-uuid-${i}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground p-3 rounded-md bg-muted/30 space-y-1">
        <p><span className="font-semibold">v4</span> — 122 random bits. Best for general use.</p>
        <p><span className="font-semibold">v7</span> — Unix timestamp prefix + random bits. Sortable; great for database primary keys.</p>
      </div>
    </div>
  );
}
