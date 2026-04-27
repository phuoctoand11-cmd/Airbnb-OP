import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, Unlock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const paddedStr = padded + "=".repeat(padLen);
  try {
    return decodeURIComponent(
      escape(atob(paddedStr))
    );
  } catch {
    return atob(paddedStr);
  }
}

export default function Jwt() {
  const [input, setInput] = useState("");
  const [header, setHeader] = useState<object | null>(null);
  const [payload, setPayload] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDecode = () => {
    if (!input.trim()) return;
    const parts = input.trim().split(".");
    if (parts.length !== 3) {
      setError("Invalid JWT: expected 3 parts separated by '.'");
      setHeader(null);
      setPayload(null);
      return;
    }
    try {
      const h = JSON.parse(base64urlDecode(parts[0]));
      const p = JSON.parse(base64urlDecode(parts[1]));
      setHeader(h);
      setPayload(p);
      setError(null);
    } catch (err: any) {
      setError("Failed to decode JWT: " + (err.message || "Invalid format"));
      setHeader(null);
      setPayload(null);
    }
  };

  const copySection = (data: object, label: string) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">JWT Decoder</h1>
        <p className="text-muted-foreground mt-1">Decode JSON Web Tokens without verifying the signature.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium flex justify-between items-center">
            <span>JWT Token</span>
            <Button variant="secondary" size="sm" onClick={handleDecode} data-testid="btn-decode">
              <Unlock className="h-4 w-4 mr-1" /> Decode
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Textarea
            className="rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[100px]"
            placeholder="Paste your JWT token here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            data-testid="input-jwt"
            spellCheck={false}
          />
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive text-sm font-mono" data-testid="text-error">
          {error}
        </div>
      )}

      {(header || payload) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="flex flex-col border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Header</Badge>
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => copySection(header!, "Header")} data-testid="btn-copy-header">
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-auto bg-muted/10">
              <pre className="p-4 font-mono text-sm" data-testid="output-header">
                {JSON.stringify(header, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card className="flex flex-col border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Payload</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copySection(payload!, "Payload")} data-testid="btn-copy-payload">
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-auto bg-muted/10">
              <pre className="p-4 font-mono text-sm" data-testid="output-payload">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="text-xs text-muted-foreground p-3 rounded-md bg-muted/30">
        Note: This tool only decodes the token — it does not verify the signature. Never trust token claims without signature verification on your server.
      </div>
    </div>
  );
}
