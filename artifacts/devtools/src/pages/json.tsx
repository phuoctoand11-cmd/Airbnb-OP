import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, FileJson, Minus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Json() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFormat = () => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      setOutput("");
    }
  };

  const handleMinify = () => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      setOutput("");
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast({
      title: "Copied to clipboard",
      description: "The JSON output has been copied.",
    });
  };

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">JSON Formatter/Validator</h1>
        <p className="text-muted-foreground mt-1">Format, minify, and validate JSON strings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <Card className="flex flex-col border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Input</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleFormat} data-testid="btn-format">
                  <FileJson className="h-4 w-4 mr-1" /> Format
                </Button>
                <Button variant="secondary" size="sm" onClick={handleMinify} data-testid="btn-minify">
                  <Minus className="h-4 w-4 mr-1" /> Minify
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex">
            <Textarea
              className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4"
              placeholder="Paste JSON here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              data-testid="input-json"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col border-border shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Output</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!output}
                data-testid="btn-copy"
                className="h-8"
              >
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto bg-muted/10 relative">
            {error ? (
              <div className="p-4 text-destructive font-mono text-sm" data-testid="text-error">
                {error}
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
