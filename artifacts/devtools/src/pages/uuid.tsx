import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { v4 as uuidv4 } from "uuid";

export default function Uuid() {
  const [uuids, setUuids] = useState<string[]>([uuidv4()]);
  const [count, setCount] = useState(1);
  const { toast } = useToast();

  const generate = () => {
    const n = Math.max(1, Math.min(100, count));
    setUuids(Array.from({ length: n }, () => uuidv4()));
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
        <p className="text-muted-foreground mt-1">Generate version 4 UUIDs (random).</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Options</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
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
          <CardTitle className="text-sm font-medium">Generated UUIDs</CardTitle>
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
    </div>
  );
}
