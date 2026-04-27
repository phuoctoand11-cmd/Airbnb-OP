import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Hash as HashIcon, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { md5 } from "js-md5";

async function sha(algorithm: string, text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await window.crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface HashResults {
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
}

export default function HashPage() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<HashResults | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!input) return;
    setLoading(true);
    try {
      const [sha1, sha256, sha512] = await Promise.all([
        sha("SHA-1", input),
        sha("SHA-256", input),
        sha("SHA-512", input),
      ]);
      setResults({
        md5: md5(input),
        sha1,
        sha256,
        sha512,
      });
    } finally {
      setLoading(false);
    }
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: "Copied", description: `${label} hash copied.` });
  };

  const hashes: { key: keyof HashResults; label: string }[] = [
    { key: "md5", label: "MD5" },
    { key: "sha1", label: "SHA-1" },
    { key: "sha256", label: "SHA-256" },
    { key: "sha512", label: "SHA-512" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hash Generator</h1>
        <p className="text-muted-foreground mt-1">Generate MD5, SHA-1, SHA-256, and SHA-512 hashes.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium flex justify-between items-center">
            <span>Input Text</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setInput("The quick brown fox jumps over the lazy dog")} data-testid="btn-sample">
                Sample
              </Button>
              <Button onClick={handleGenerate} disabled={loading || !input} size="sm" data-testid="btn-generate">
                <HashIcon className="h-4 w-4 mr-1" /> {loading ? "Generating..." : "Generate Hashes"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Textarea
            className="rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[120px]"
            placeholder="Enter text to hash..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            data-testid="input-text"
            spellCheck={false}
          />
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-3">
          {hashes.map(({ key, label }) => (
            <Card key={key} className="border-border shadow-sm">
              <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between items-center">
                  <span>{label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => copy(results[key], label)}
                    data-testid={`btn-copy-${key}`}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 bg-muted/10">
                <code
                  className="font-mono text-sm break-all text-foreground"
                  data-testid={`output-${key}`}
                >
                  {results[key]}
                </code>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
