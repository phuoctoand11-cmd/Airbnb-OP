import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Sparkles, Minimize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Lang = "javascript" | "html" | "css";

function beautifyJS(code: string, indent = 2): string {
  let result = "";
  let depth = 0;
  let i = 0;
  const sp = " ".repeat(indent);

  while (i < code.length) {
    const ch = code[i];
    if (ch === "{" || ch === "[" || ch === "(") {
      result += ch + "\n" + sp.repeat(depth + 1);
      depth++;
    } else if (ch === "}" || ch === "]" || ch === ")") {
      depth = Math.max(0, depth - 1);
      result = result.trimEnd();
      result += "\n" + sp.repeat(depth) + ch;
    } else if (ch === ";") {
      result += ch + "\n" + sp.repeat(depth);
    } else if (ch === "\n") {
      const next = result.trimEnd();
      if (next.slice(-1) !== "{" && next.slice(-1) !== "," && next.slice(-1) !== "(") {
        result = next + "\n" + sp.repeat(depth);
      }
    } else {
      result += ch;
    }
    i++;
  }
  return result.split("\n").map((l) => l.trimEnd()).filter((l, idx, arr) => !(l === "" && arr[idx - 1] === "")).join("\n");
}

function minifyJS(code: string): string {
  return code
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,=+\-<>!&|()[\]])\s*/g, "$1")
    .trim();
}

function beautifyHTML(html: string, indent = 2): string {
  const sp = " ".repeat(indent);
  const voidTags = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
  let depth = 0;
  const result: string[] = [];

  const tokens = html.replace(/>\s*</g, ">\n<").split("\n");
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    const isClosing = /^<\//.test(t);
    const isSelfClosing = /\/>$/.test(t) || voidTags.has((t.match(/^<(\w+)/) || [])[1]?.toLowerCase() ?? "");
    if (isClosing) depth = Math.max(0, depth - 1);
    result.push(sp.repeat(depth) + t);
    if (!isClosing && !isSelfClosing && t.startsWith("<") && !t.includes("</")) depth++;
  }
  return result.join("\n");
}

function minifyHTML(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

function beautifyCSS(css: string, indent = 2): string {
  const sp = " ".repeat(indent);
  return css
    .replace(/\s*\{\s*/g, " {\n" + sp)
    .replace(/;\s*/g, ";\n" + sp)
    .replace(/\s*\}\s*/g, "\n}\n\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

function minifyCSS(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>~+])\s*/g, "$1")
    .trim();
}

export default function Beautifier() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [lang, setLang] = useState<Lang>("javascript");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const runBeautify = () => {
    if (!input.trim()) return;
    try {
      let result = "";
      if (lang === "javascript") result = beautifyJS(input);
      else if (lang === "html") result = beautifyHTML(input);
      else result = beautifyCSS(input);
      setOutput(result);
      setError(null);
    } catch (err) {
      setError("Failed to format: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const runMinify = () => {
    if (!input.trim()) return;
    try {
      let result = "";
      if (lang === "javascript") result = minifyJS(input);
      else if (lang === "html") result = minifyHTML(input);
      else result = minifyCSS(input);
      setOutput(result);
      setError(null);
    } catch (err) {
      setError("Failed to minify: " + (err instanceof Error ? err.message : String(err)));
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
        <p className="text-muted-foreground mt-1">Format or minify HTML, CSS, and JavaScript code.</p>
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
        <Button onClick={runBeautify} data-testid="btn-beautify">
          <Sparkles className="h-4 w-4 mr-1" /> Beautify
        </Button>
        <Button variant="outline" onClick={runMinify} data-testid="btn-minify">
          <Minimize2 className="h-4 w-4 mr-1" /> Minify
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
