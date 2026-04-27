import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function toCamelCase(s: string): string {
  return s.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^(.)/, (m) => m.toLowerCase());
}
function toPascalCase(s: string): string {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}
function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
}
function toKebabCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
}
function toScreamingSnake(s: string): string {
  return toSnakeCase(s).toUpperCase();
}
function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}
function toSentenceCase(s: string): string {
  return s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
}

interface CaseResult {
  label: string;
  value: string;
  id: string;
}

export default function CasePage() {
  const [input, setInput] = useState("");
  const { toast } = useToast();

  const cases: CaseResult[] = input.trim()
    ? [
        { label: "camelCase", value: toCamelCase(input), id: "camel" },
        { label: "PascalCase", value: toPascalCase(input), id: "pascal" },
        { label: "snake_case", value: toSnakeCase(input), id: "snake" },
        { label: "kebab-case", value: toKebabCase(input), id: "kebab" },
        { label: "SCREAMING_SNAKE", value: toScreamingSnake(input), id: "screaming" },
        { label: "Title Case", value: toTitleCase(input), id: "title" },
        { label: "Sentence case", value: toSentenceCase(input), id: "sentence" },
        { label: "lowercase", value: input.toLowerCase(), id: "lower" },
        { label: "UPPERCASE", value: input.toUpperCase(), id: "upper" },
      ]
    : [];

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: "Copied", description: `${label} copied.` });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Case Converter</h1>
        <p className="text-muted-foreground mt-1">Convert text between different naming conventions instantly.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Input</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Textarea
            className="rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[100px]"
            placeholder="Enter text to convert, e.g. hello world or myVariableName"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            data-testid="input-text"
            spellCheck={false}
          />
        </CardContent>
      </Card>

      {cases.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="list-cases">
          {cases.map(({ label, value, id }) => (
            <Card key={id} className="border-border shadow-sm" data-testid={`card-case-${id}`}>
              <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between items-center">
                  <span>{label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => copy(value, label)}
                    data-testid={`btn-copy-${id}`}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 bg-muted/10">
                <code className="font-mono text-sm break-all" data-testid={`output-${id}`}>{value}</code>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
