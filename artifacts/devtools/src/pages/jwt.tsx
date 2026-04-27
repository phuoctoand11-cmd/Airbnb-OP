import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, Unlock, AlertTriangle, CheckCircle2, Clock, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const paddedStr = padded + "=".repeat(padLen);
  try {
    const binary = atob(paddedStr);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return atob(paddedStr);
  }
}

type ExpiryStatus = "valid" | "expired" | "none";

function getExpiryStatus(payload: Record<string, unknown>): ExpiryStatus {
  if (typeof payload.exp !== "number") return "none";
  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now ? "valid" : "expired";
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "number") return String(value);
  try {
    return `${value} (${new Date(value * 1000).toLocaleString()})`;
  } catch {
    return String(value);
  }
}

const TIME_CLAIMS = new Set(["exp", "iat", "nbf"]);

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

export default function Jwt() {
  const [input, setInput] = useState("");
  const [decoded, setDecoded] = useState<DecodedJwt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDecode = () => {
    if (!input.trim()) return;
    const parts = input.trim().split(".");
    if (parts.length !== 3) {
      setError("Invalid JWT: expected 3 parts separated by '.'");
      setDecoded(null);
      return;
    }
    try {
      const h = JSON.parse(base64urlDecode(parts[0])) as Record<string, unknown>;
      const p = JSON.parse(base64urlDecode(parts[1])) as Record<string, unknown>;
      setDecoded({ header: h, payload: p, signature: parts[2] });
      setError(null);
    } catch (err) {
      setError("Failed to decode JWT: " + (err instanceof Error ? err.message : "Invalid format"));
      setDecoded(null);
    }
  };

  const copySection = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const expiryStatus = decoded ? getExpiryStatus(decoded.payload) : "none";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">JWT Decoder</h1>
        <p className="text-muted-foreground mt-1">Decode JSON Web Tokens — inspect header, payload, and signature segments.</p>
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
            placeholder="Paste your JWT token here... (eyJ...)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.ctrlKey && handleDecode()}
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

      {expiryStatus !== "none" && (
        <div
          data-testid="expiry-banner"
          className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium ${
            expiryStatus === "expired"
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
          }`}
        >
          {expiryStatus === "expired" ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {expiryStatus === "expired"
            ? `Token expired on ${new Date((decoded!.payload.exp as number) * 1000).toLocaleString()}`
            : `Token valid until ${new Date((decoded!.payload.exp as number) * 1000).toLocaleString()}`}
        </div>
      )}

      {decoded && (
        <div className="space-y-4">
          {/* Header + Payload side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="flex flex-col border-border shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Header</Badge>
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copySection(JSON.stringify(decoded.header, null, 2), "Header")} data-testid="btn-copy-header">
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto bg-muted/10">
                <pre className="p-4 font-mono text-sm" data-testid="output-header">
                  {JSON.stringify(decoded.header, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card className="flex flex-col border-border shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Payload</Badge>
                    {expiryStatus === "expired" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                    {expiryStatus === "valid" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copySection(JSON.stringify(decoded.payload, null, 2), "Payload")} data-testid="btn-copy-payload">
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 overflow-auto bg-muted/10 space-y-1">
                {Object.entries(decoded.payload).map(([key, value]) => (
                  <div key={key} className="flex gap-3 text-sm font-mono leading-relaxed" data-testid={`payload-${key}`}>
                    <span className="text-primary/70 shrink-0">{key}:</span>
                    <span className={`break-all ${
                      key === "exp" && expiryStatus === "expired" ? "text-destructive" :
                      key === "exp" && expiryStatus === "valid" ? "text-green-600 dark:text-green-400" : ""
                    }`}>
                      {TIME_CLAIMS.has(key) ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 inline shrink-0" />
                          {formatTimestamp(value)}
                        </span>
                      ) : (
                        typeof value === "object" ? JSON.stringify(value) : String(value)
                      )}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Signature */}
          <Card className="border-border shadow-sm" data-testid="card-signature">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Signature</Badge>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => copySection(decoded.signature, "Signature")} data-testid="btn-copy-signature">
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 bg-muted/10 space-y-2">
              <code className="font-mono text-sm break-all text-amber-500 dark:text-amber-400" data-testid="output-signature">
                {decoded.signature}
              </code>
              <p className="text-xs text-muted-foreground">
                This is the raw base64url-encoded signature segment. Signature verification requires your secret key and must be performed server-side.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="text-xs text-muted-foreground p-3 rounded-md bg-muted/30">
        This tool only decodes the token — it does not verify the signature. Never trust token claims without signature verification on your server.
      </div>
    </div>
  );
}
