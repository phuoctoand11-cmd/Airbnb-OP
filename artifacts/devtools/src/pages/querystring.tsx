import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface KVPair {
  key: string;
  value: string;
}

function pairsToRaw(pairs: KVPair[]): string {
  const params = new URLSearchParams();
  pairs.filter((p) => p.key.trim()).forEach(({ key, value }) => params.append(key.trim(), value));
  const str = params.toString();
  return str ? "?" + str : "";
}

function rawToPairs(raw: string): KVPair[] | null {
  try {
    let qs = raw.trim();
    try {
      const url = new URL(qs.startsWith("http") ? qs : "https://x.com/" + (qs.startsWith("?") ? "" : "?") + qs.replace(/^\?/, ""));
      qs = url.search;
    } catch {
      // treat as raw query string
    }
    const params = new URLSearchParams(qs);
    const result: KVPair[] = [];
    params.forEach((v, k) => result.push({ key: k, value: v }));
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

export default function QueryString() {
  const [pairs, setPairs] = useState<KVPair[]>([{ key: "", value: "" }]);
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const { toast } = useToast();

  const updatePairsFromRaw = useCallback((raw: string) => {
    setRawText(raw);
    if (!raw.trim()) { setRawError(null); return; }
    const result = rawToPairs(raw);
    if (result) {
      setPairs(result);
      setRawError(null);
    } else {
      setRawError("No valid query parameters found");
    }
  }, []);

  const updateRawFromPairs = useCallback((newPairs: KVPair[]) => {
    setPairs(newPairs);
    setRawText(pairsToRaw(newPairs));
    setRawError(null);
  }, []);

  const addPair = () => updateRawFromPairs([...pairs, { key: "", value: "" }]);
  const removePair = (i: number) => updateRawFromPairs(pairs.filter((_, idx) => idx !== i));
  const updatePair = (i: number, field: "key" | "value", val: string) => {
    const updated = pairs.map((pair, idx) => idx === i ? { ...pair, [field]: val } : pair);
    updateRawFromPairs(updated);
  };

  const copyRaw = () => {
    const raw = pairsToRaw(pairs);
    navigator.clipboard.writeText(raw);
    toast({ title: "Copied", description: "Query string copied." });
  };

  const copyPairs = () => {
    const text = pairs.filter((p) => p.key).map((p) => `${p.key}=${p.value}`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Parameters copied." });
  };

  const clearAll = () => { setPairs([{ key: "", value: "" }]); setRawText(""); setRawError(null); };

  const activePairs = pairs.filter((p) => p.key.trim());

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Query String Parser / Builder</h1>
        <p className="text-muted-foreground mt-1">
          Edit query parameters as a table or raw text — both stay in sync.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Table editor */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span>Parameters</span>
                {activePairs.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{activePairs.length}</Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={copyPairs} disabled={activePairs.length === 0} data-testid="btn-copy-pairs">
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll} data-testid="btn-clear">
                  Clear
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2 flex-1">
            <div className="space-y-2" data-testid="list-pairs">
              {pairs.map((pair, i) => (
                <div key={i} className="flex gap-2 items-center" data-testid={`pair-${i}`}>
                  <Input
                    placeholder="key"
                    value={pair.key}
                    onChange={(e) => updatePair(i, "key", e.target.value)}
                    className="flex-1 font-mono text-sm"
                    data-testid={`input-key-${i}`}
                  />
                  <span className="text-muted-foreground shrink-0">=</span>
                  <Input
                    placeholder="value"
                    value={pair.value}
                    onChange={(e) => updatePair(i, "value", e.target.value)}
                    className="flex-1 font-mono text-sm"
                    data-testid={`input-value-${i}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removePair(i)}
                    disabled={pairs.length === 1}
                    data-testid={`btn-remove-${i}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addPair} data-testid="btn-add-pair">
              <Plus className="h-4 w-4 mr-1" /> Add Parameter
            </Button>
          </CardContent>
        </Card>

        {/* Raw editor */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Raw Query String</span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={copyRaw} disabled={!rawText} data-testid="btn-copy-raw">
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex-1 flex flex-col gap-2">
            <Textarea
              className="flex-1 font-mono text-sm resize-none min-h-[200px]"
              placeholder="Paste a URL or query string: ?foo=bar&baz=1"
              value={rawText}
              onChange={(e) => updatePairsFromRaw(e.target.value)}
              data-testid="input-raw"
              spellCheck={false}
            />
            {rawError && <p className="text-destructive text-xs" data-testid="text-raw-error">{rawError}</p>}
            <p className="text-xs text-muted-foreground">
              Accepts a full URL, a query string starting with <code>?</code>, or just the params.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
