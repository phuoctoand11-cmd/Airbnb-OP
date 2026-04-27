import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";

const SAMPLE = `# Markdown Preview

Write **bold**, *italic*, or \`code\` inline.

## Code blocks

\`\`\`javascript
const hello = "world";
console.log(hello);
\`\`\`

## Tables

| Name | Value |
|------|-------|
| Foo  | 1     |
| Bar  | 2     |

## Lists

- Item one
- Item two
  - Nested

1. First
2. Second

> Blockquote text here.

[Link](https://example.com)
`;

export default function Markdown() {
  const [input, setInput] = useState(SAMPLE);
  const { toast } = useToast();

  const copyHtml = () => {
    const el = document.getElementById("md-preview");
    if (el) {
      navigator.clipboard.writeText(el.innerHTML);
      toast({ title: "Copied", description: "Rendered HTML copied to clipboard." });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Markdown Preview</h1>
        <p className="text-muted-foreground mt-1">Write Markdown on the left, see rendered output on the right.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "60vh" }}>
        <Card className="flex flex-col border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Markdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex">
            <Textarea
              className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              data-testid="input-markdown"
              spellCheck={false}
              style={{ minHeight: "500px" }}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col border-border shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Preview</span>
              <Button variant="ghost" size="sm" onClick={copyHtml} data-testid="btn-copy-html">
                <Copy className="h-4 w-4 mr-1" /> Copy HTML
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex-1 overflow-auto bg-background">
            <div
              id="md-preview"
              data-testid="output-preview"
              className="prose prose-sm dark:prose-invert max-w-none"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{input}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
