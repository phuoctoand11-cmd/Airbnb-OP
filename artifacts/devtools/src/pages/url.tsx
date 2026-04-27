import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, ArrowRight, ArrowLeft, Globe, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface UrlComponents {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  params: { key: string; value: string }[];
}

function parseUrlComponents(raw: string): UrlComponents | null {
  try {
    const u = new URL(raw.trim().startsWith("http") ? raw.trim() : "https://" + raw.trim());
    const params: { key: string; value: string }[] = [];
    u.searchParams.forEach((v, k) => params.push({ key: k, value: v }));
    return {
      protocol: u.protocol,
      username: u.username,
      password: u.password,
      hostname: u.hostname,
      port: u.port,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
      params,
    };
  } catch {
    return null;
  }
}

type EncodeMode = "component" | "full";

const MODE_INFO: Record<EncodeMode, { label: string; fn: (s: string) => string; dec: (s: string) => string; desc: string }> = {
  component: {
    label: "Component (encodeURIComponent)",
    fn: encodeURIComponent,
    dec: decodeURIComponent,
    desc: "Encodes ALL special characters including ://?&#. Use for individual query values.",
  },
  full: {
    label: "Full URL (encodeURI)",
    fn: encodeURI,
    dec: decodeURI,
    desc: "Preserves :// ? # & = characters. Use for complete URLs.",
  },
};

export default function Url() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [components, setComponents] = useState<UrlComponents | null>(null);
  const [mode, setMode] = useState<EncodeMode>("component");
  const { toast } = useToast();

  const handleEncode = () => {
    if (!input) return;
    try {
      setOutput(MODE_INFO[mode].fn(input));
      setError(null);
    } catch {
      setError("Failed to encode");
    }
  };

  const handleDecode = () => {
    if (!input) return;
    try {
      setOutput(MODE_INFO[mode].dec(input));
      setError(null);
    } catch {
      setError("Invalid URL encoding — could not decode");
      setOutput("");
    }
  };

  const handleParseComponents = () => {
    if (!input) return;
    const result = parseUrlComponents(input);
    if (!result) {
      setError("Could not parse as a URL");
      setComponents(null);
    } else {
      setComponents(result);
      setError(null);
    }
  };

  const handleCopy = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label ?? "Value"} copied to clipboard.` });
  };

  const handleClear = () => { setInput(""); setOutput(""); setError(null); setComponents(null); };

  const COMPONENT_ROWS = components
    ? [
        { label: "Protocol", value: components.protocol },
        { label: "Hostname", value: components.hostname },
        { label: "Port", value: components.port || "(default)" },
        { label: "Pathname", value: components.pathname },
        { label: "Search", value: components.search || "(none)" },
        { label: "Hash", value: components.hash || "(none)" },
        ...(components.username ? [{ label: "Username", value: components.username }] : []),
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">URL Encode / Decode</h1>
        <p className="text-muted-foreground mt-1">Encode and decode URL strings using component or full-URL mode, or parse a URL into its components.</p>
      </div>

      <Tabs defaultValue="encode">
        <TabsList data-testid="tabs-mode">
          <TabsTrigger value="encode" data-testid="tab-encode"><Layers className="h-4 w-4 mr-1.5" />Encode / Decode</TabsTrigger>
          <TabsTrigger value="parse" data-testid="tab-parse"><Globe className="h-4 w-4 mr-1.5" />Parse URL</TabsTrigger>
        </TabsList>

        <TabsContent value="encode" className="mt-4 space-y-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">Mode</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Encoding mode</Label>
                  <Select value={mode} onValueChange={(v) => { setMode(v as EncodeMode); setOutput(""); setError(null); }}>
                    <SelectTrigger className="w-72" data-testid="select-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODE_INFO) as EncodeMode[]).map((k) => (
                        <SelectItem key={k} value={k}>{MODE_INFO[k].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground pb-1">{MODE_INFO[mode].desc}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "350px" }}>
            <Card className="flex flex-col border-border shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium flex justify-between items-center">
                  <span>Input</span>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={handleEncode} data-testid="btn-encode" className="h-7 px-2 text-xs">
                      Encode <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleDecode} data-testid="btn-decode" className="h-7 px-2 text-xs">
                      Decode <ArrowLeft className="h-3.5 w-3.5 ml-1" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleClear} data-testid="btn-clear" className="h-7 px-2 text-xs">Clear</Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex">
                <Textarea
                  className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[300px]"
                  placeholder="Enter text to encode, or encoded string to decode..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleEncode(); }}
                  data-testid="input-url"
                  spellCheck={false}
                />
              </CardContent>
            </Card>

            <Card className="flex flex-col border-border shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium flex justify-between items-center">
                  <span>Output</span>
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(output, "Output")} disabled={!output} data-testid="btn-copy" className="h-7 px-2 text-xs">
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-auto bg-muted/10">
                {error ? (
                  <div className="p-4 text-destructive font-mono text-sm" data-testid="text-error">{error}</div>
                ) : (
                  <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all" data-testid="output-url">
                    {output || <span className="text-muted-foreground italic">Output will appear here...</span>}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="parse" className="mt-4 space-y-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">URL to Parse</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex gap-2">
              <Input
                placeholder="https://example.com/path?foo=bar&baz=1#section"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleParseComponents()}
                data-testid="input-url-parse"
                className="font-mono text-sm"
              />
              <Button onClick={handleParseComponents} data-testid="btn-parse">
                <Globe className="h-4 w-4 mr-1" /> Parse
              </Button>
            </CardContent>
          </Card>

          {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-error">{error}</div>}

          {components && (
            <div className="space-y-4">
              <Card className="border-border shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/20">
                  <CardTitle className="text-sm font-medium">URL Components</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border" data-testid="table-components">
                    {COMPONENT_ROWS.map(({ label, value }) => (
                      <div key={label} className="flex items-center px-4 py-2.5 gap-4 group">
                        <span className="text-xs text-muted-foreground uppercase w-20 shrink-0">{label}</span>
                        <code className="font-mono text-sm flex-1 break-all" data-testid={`component-${label.toLowerCase()}`}>{value}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => handleCopy(value, label)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {components.params.length > 0 && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-muted/20">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      Query Parameters
                      <Badge variant="secondary" className="text-[10px]">{components.params.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border" data-testid="table-params">
                      {components.params.map(({ key, value }, i) => (
                        <div key={i} className="flex items-center px-4 py-2.5 gap-4" data-testid={`param-row-${i}`}>
                          <code className="font-mono text-sm text-primary min-w-[120px]">{key}</code>
                          <span className="text-muted-foreground">=</span>
                          <code className="font-mono text-sm flex-1 break-all">{value}</code>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
