import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, ArrowRight, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Base64() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleEncode = () => {
    if (!input) return;
    try {
      setOutput(btoa(unescape(encodeURIComponent(input))));
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to encode");
    }
  };

  const handleDecode = () => {
    if (!input) return;
    try {
      setOutput(decodeURIComponent(escape(atob(input))));
      setError(null);
    } catch (err: any) {
      setError("Invalid Base64 string");
      setOutput("");
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast({
      title: "Copied to clipboard",
      description: "The output has been copied.",
    });
  };

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Base64 Encode/Decode</h1>
        <p className="text-muted-foreground mt-1">Convert text to and from Base64 encoding.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <Card className="flex flex-col border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Input</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleEncode} data-testid="btn-encode">
                  Encode <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDecode} data-testid="btn-decode">
                  Decode <ArrowLeft className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex">
            <Textarea
              className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4"
              placeholder="Enter text to encode or decode..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              data-testid="input-base64"
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
              <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all" data-testid="output-base64">
                {output || <span className="text-muted-foreground italic">Output will appear here...</span>}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
