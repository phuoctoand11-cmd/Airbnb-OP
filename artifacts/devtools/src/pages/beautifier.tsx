import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Sparkles, Minimize2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Lang = "javascript" | "html" | "css";

const SAMPLES: Record<Lang, string> = {
  javascript: `function greet(name){if(!name){return "Hello, World!";}return "Hello, "+name+"!";}\n\nconst result=greet("Developer");console.log(result);`,
  html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sample</title></head><body><header><h1>Hello World</h1></header><main><p>Welcome to the <strong>Developer Toolkit</strong>.</p></main></body></html>`,
  css: `.container{display:flex;align-items:center;justify-content:space-between;padding:16px;background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}.button{background:#007bff;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer}.button:hover{background:#0056b3}`,
};

async function formatCode(code: string, lang: Lang): Promise<string> {
  const prettier = await import("prettier/standalone");
  if (lang === "javascript") {
    const [babel, estree] = await Promise.all([
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
    ]);
    return prettier.format(code, { parser: "babel", plugins: [babel, estree], printWidth: 100 });
  }
  if (lang === "html") {
    const html = await import("prettier/plugins/html");
    return prettier.format(code, { parser: "html", plugins: [html], printWidth: 100 });
  }
  const postcss = await import("prettier/plugins/postcss");
  return prettier.format(code, { parser: "css", plugins: [postcss], printWidth: 100 });
}

async function minifyCode(code: string, lang: Lang): Promise<string> {
  if (lang === "javascript") {
    const { minify } = await import("terser");
    const result = await minify(code, {
      compress: true,
      mangle: false,
      output: { comments: false },
    });
    if (!result.code) throw new Error("Minification produced no output");
    return result.code;
  }
  if (lang === "css") {
    return code
      .replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([{};:,>~+])\s*/g, "$1")
      .replace(/;}/g, "}")
      .trim();
  }
  return code
    .replace(/<!--(?!-?>)(?:[^-]|-(?!-))*-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

export default function Beautifier() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [lang, setLang] = useState<Lang>("javascript");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const run = async (action: "beautify" | "minify") => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = action === "beautify"
        ? await formatCode(input, lang)
        : await minifyCode(input, lang);
      setOutput(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to ${action}: ${msg}`);
      setOutput("");
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast({ title: "Copied", description: "Code copied to clipboard." });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Code Beautifier / Minifier</h1>
        <p className="text-muted-foreground mt-1">Format or minify JavaScript, HTML, and CSS with grammar-aware parsing.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
          <SelectTrigger className="w-40" data-testid="select-lang">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="javascript">JavaScript</SelectItem>
            <SelectItem value="html">HTML</SelectItem>
            <SelectItem value="css">CSS</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => run("beautify")} disabled={loading} data-testid="btn-beautify">
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Beautify
        </Button>
        <Button variant="outline" onClick={() => run("minify")} disabled={loading} data-testid="btn-minify">
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Minimize2 className="h-4 w-4 mr-1" />}
          Minify
        </Button>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setInput(SAMPLES[lang]); setOutput(""); setError(null); }} data-testid="btn-sample">
          Sample
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "50vh" }}>
        <Card className="flex flex-col border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Input</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex">
            <Textarea
              className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4"
              placeholder={`Paste ${lang.toUpperCase()} code here...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              data-testid="input-code"
              spellCheck={false}
              style={{ minHeight: "400px" }}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col border-border shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Output</span>
              <Button variant="ghost" size="sm" onClick={copy} disabled={!output} data-testid="btn-copy">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto bg-muted/10">
            {error ? (
              <div className="p-4 text-destructive text-sm font-mono" data-testid="text-error">{error}</div>
            ) : loading ? (
              <div className="p-4 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Processing...
              </div>
            ) : (
              <pre className="p-4 font-mono text-sm whitespace-pre-wrap" data-testid="output-code">
                {output || <span className="text-muted-foreground italic">Output will appear here...</span>}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
