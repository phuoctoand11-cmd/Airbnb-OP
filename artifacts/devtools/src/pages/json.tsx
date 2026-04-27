import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, FileJson, Minus, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// --- JSON Tree View ---
type JsonPrimitive = string | number | boolean | null;
interface JsonObject { [key: string]: JsonValue }
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

function JsonNode({ value, depth = 0 }: { value: JsonValue; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (value === null) return <span className="text-orange-500">null</span>;
  if (typeof value === "boolean") return <span className="text-orange-500">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-blue-400">{value}</span>;
  if (typeof value === "string") return <span className="text-green-400">"{value}"</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <span>
        <button
          className="text-muted-foreground hover:text-foreground inline-flex items-center"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />}
          <span className="text-muted-foreground text-xs ml-0.5">
            [{collapsed ? `${value.length} items` : ""}]
          </span>
        </button>
        {!collapsed && (
          <div className="pl-4 border-l border-border/30 ml-1">
            {value.map((item, i) => (
              <div key={i} className="leading-relaxed">
                <span className="text-muted-foreground text-xs mr-1">{i}</span>
                <JsonNode value={item} depth={depth + 1} />
                {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  const entries = Object.entries(value as Record<string, JsonValue>);
  if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
  return (
    <span>
      <button
        className="text-muted-foreground hover:text-foreground inline-flex items-center"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? <ChevronRight className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />}
        <span className="text-muted-foreground text-xs ml-0.5">
          {"{"}
          {collapsed ? `${entries.length} keys` : ""}
          {"}"}
        </span>
      </button>
      {!collapsed && (
        <div className="pl-4 border-l border-border/30 ml-1">
          {entries.map(([key, val], i) => (
            <div key={key} className="leading-relaxed">
              <span className="text-primary/80 font-medium">"{key}"</span>
              <span className="text-muted-foreground">: </span>
              <JsonNode value={val} depth={depth + 1} />
              {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export default function Json() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [parsed, setParsed] = useState<JsonValue | null>(null);
  const [mode, setMode] = useState<"format" | "minify" | "tree">("format");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFormat = useCallback(() => {
    if (!input.trim()) return;
    try {
      const p = JSON.parse(input);
      setOutput(JSON.stringify(p, null, 2));
      setParsed(p as JsonValue);
      setError(null);
      setMode("format");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      setOutput("");
      setParsed(null);
    }
  }, [input]);

  const handleMinify = useCallback(() => {
    if (!input.trim()) return;
    try {
      const p = JSON.parse(input);
      setOutput(JSON.stringify(p));
      setParsed(p as JsonValue);
      setError(null);
      setMode("minify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      setOutput("");
      setParsed(null);
    }
  }, [input]);

  const handleTree = useCallback(() => {
    if (!input.trim()) return;
    try {
      const p = JSON.parse(input);
      setOutput(JSON.stringify(p, null, 2));
      setParsed(p as JsonValue);
      setError(null);
      setMode("tree");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      setParsed(null);
    }
  }, [input]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast({ title: "Copied", description: "JSON output copied." });
  };

  const SAMPLE_JSON = `{\n  "name": "Developer Toolkit",\n  "version": "1.0.0",\n  "tools": ["JSON", "Base64", "JWT", "Regex"],\n  "config": {\n    "theme": "dark",\n    "language": "en"\n  },\n  "enabled": true\n}`;

  const MODES = [
    { key: "format" as const, label: "Format", icon: FileJson, action: handleFormat, testId: "btn-format" },
    { key: "minify" as const, label: "Minify", icon: Minus, action: handleMinify, testId: "btn-minify" },
    { key: "tree"   as const, label: "Tree",   icon: ChevronDown, action: handleTree,   testId: "btn-tree" },
  ];

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">JSON Formatter / Validator</h1>
        <p className="text-muted-foreground mt-1">Format, minify, validate, and explore JSON as a tree.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <Card className="flex flex-col border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Input</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setInput(SAMPLE_JSON); setOutput(""); setMode("format"); setParsed(null); }}
                  data-testid="btn-sample"
                  className="h-7 px-2 text-xs"
                >
                  Sample
                </Button>
                {MODES.map(({ key, label, icon: Icon, action, testId }) => (
                  <Button
                    key={key}
                    variant={mode === key && parsed ? "secondary" : "ghost"}
                    size="sm"
                    onClick={action}
                    data-testid={testId}
                    className="h-7 px-2 text-xs"
                  >
                    <Icon className="h-3.5 w-3.5 mr-1" /> {label}
                  </Button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex">
            <Textarea
              className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4"
              placeholder="Paste JSON here... (Ctrl+Enter to format)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleFormat(); }}
              data-testid="input-json"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col border-border shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Output</span>
              <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!output} data-testid="btn-copy" className="h-8">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto bg-muted/10 relative">
            {error ? (
              <div className="p-4 text-destructive font-mono text-sm" data-testid="text-error">{error}</div>
            ) : mode === "tree" && parsed ? (
              <div className="p-4 font-mono text-sm leading-relaxed" data-testid="output-tree">
                <JsonNode value={parsed} depth={0} />
              </div>
            ) : (
              <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all" data-testid="output-json">
                {output || <span className="text-muted-foreground italic">Output will appear here...</span>}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
