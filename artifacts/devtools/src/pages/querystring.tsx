import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, Trash2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface KVPair {
  key: string;
  value: string;
}

export default function QueryString() {
  const [parseInput, setParseInput] = useState("");
  const [parsed, setParsed] = useState<KVPair[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<KVPair[]>([{ key: "", value: "" }]);
  const { toast } = useToast();

  const handleParse = () => {
    if (!parseInput.trim()) return;
    try {
      let qs = parseInput.trim();
      try {
        const url = new URL(qs);
        qs = url.search;
      } catch {
        // not a full URL, treat as query string
      }
      const params = new URLSearchParams(qs);
      const result: KVPair[] = [];
      params.forEach((value, key) => result.push({ key, value }));
      if (result.length === 0) { setParseError("No query parameters found"); setParsed(null); return; }
      setParsed(result);
      setParseError(null);
    } catch (err) {
      setParseError("Failed to parse: " + (err instanceof Error ? err.message : String(err)));
      setParsed(null);
    }
  };

  const copyParsed = () => {
    if (!parsed) return;
    const text = parsed.map((p) => `${p.key} = ${p.value}`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Parsed parameters copied." });
  };

  const addPair = () => setPairs((p) => [...p, { key: "", value: "" }]);
  const removePair = (i: number) => setPairs((p) => p.filter((_, idx) => idx !== i));
  const updatePair = (i: number, field: "key" | "value", val: string) => {
    setPairs((p) => p.map((pair, idx) => idx === i ? { ...pair, [field]: val } : pair));
  };

  const buildQueryString = () => {
    const filtered = pairs.filter((p) => p.key.trim());
    const params = new URLSearchParams();
    filtered.forEach(({ key, value }) => params.append(key.trim(), value));
    return "?" + params.toString();
  };

  const copyBuilt = () => {
    const qs = buildQueryString();
    navigator.clipboard.writeText(qs);
    toast({ title: "Copied", description: "Query string copied." });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Query String Parser</h1>
        <p className="text-muted-foreground mt-1">Parse and build URL query strings.</p>
      </div>

      <Tabs defaultValue="parse">
        <TabsList data-testid="tabs-main">
          <TabsTrigger value="parse" data-testid="tab-parse">Parse</TabsTrigger>
          <TabsTrigger value="build" data-testid="tab-build">Build</TabsTrigger>
        </TabsList>

        <TabsContent value="parse" className="space-y-4 mt-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">Input URL or Query String</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com?foo=bar&baz=1 or ?foo=bar&baz=1"
                  value={parseInput}
                  onChange={(e) => setParseInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleParse()}
                  data-testid="input-parse"
                />
                <Button onClick={handleParse} data-testid="btn-parse">
                  <Search className="h-4 w-4 mr-1" /> Parse
                </Button>
              </div>
              {parseError && <p className="text-destructive text-sm" data-testid="text-parse-error">{parseError}</p>}
            </CardContent>
          </Card>

          {parsed && (
            <Card className="border-border shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium flex justify-between items-center">
                  <span>{parsed.length} parameter{parsed.length !== 1 ? "s" : ""}</span>
                  <Button variant="ghost" size="sm" onClick={copyParsed} data-testid="btn-copy-parsed">
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border" data-testid="table-params">
                  {parsed.map(({ key, value }, i) => (
                    <div key={i} className="flex items-center px-4 py-3 gap-4" data-testid={`param-row-${i}`}>
                      <code className="font-mono text-sm text-primary min-w-[120px]">{key}</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="font-mono text-sm flex-1 break-all">{decodeURIComponent(value)}</code>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="build" className="space-y-4 mt-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">Parameters</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-2" data-testid="list-build-pairs">
                {pairs.map((pair, i) => (
                  <div key={i} className="flex gap-2 items-center" data-testid={`build-pair-${i}`}>
                    <Input
                      placeholder="key"
                      value={pair.key}
                      onChange={(e) => updatePair(i, "key", e.target.value)}
                      className="flex-1 font-mono text-sm"
                      data-testid={`input-key-${i}`}
                    />
                    <span className="text-muted-foreground">=</span>
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
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removePair(i)}
                      disabled={pairs.length === 1}
                      data-testid={`btn-remove-pair-${i}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addPair} data-testid="btn-add-pair">
                <Plus className="h-4 w-4 mr-1" /> Add Parameter
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium flex justify-between items-center">
                <span>Result</span>
                <Button variant="ghost" size="sm" onClick={copyBuilt} data-testid="btn-copy-built">
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 bg-muted/10">
              <code className="font-mono text-sm break-all" data-testid="output-querystring">
                {buildQueryString()}
              </code>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
