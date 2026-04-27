import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nulla gravida orci a odio tempus orci eu bibendum feugiat".split(" ");

function getWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function getSentence(wordCount = 8): string {
  const words = Array.from({ length: wordCount + Math.floor(Math.random() * 6) }, () => getWord());
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + " " + words.slice(1).join(" ") + ".";
}

function getParagraph(): string {
  const sentences = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => getSentence());
  return sentences.join(" ");
}

export default function Lorem() {
  const [count, setCount] = useState(3);
  const [type, setType] = useState<"paragraphs" | "sentences" | "words">("paragraphs");
  const [output, setOutput] = useState("");
  const { toast } = useToast();

  const generate = () => {
    const n = Math.max(1, Math.min(100, count));
    let result = "";
    if (type === "paragraphs") {
      result = Array.from({ length: n }, getParagraph).join("\n\n");
    } else if (type === "sentences") {
      result = Array.from({ length: n }, getSentence).join(" ");
    } else {
      result = Array.from({ length: n }, getWord).join(" ");
    }
    setOutput(result);
  };

  const copy = () => {
    navigator.clipboard.writeText(output);
    toast({ title: "Copied", description: "Lorem ipsum text copied." });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lorem Ipsum Generator</h1>
        <p className="text-muted-foreground mt-1">Generate placeholder text for mockups and layouts.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Options</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Count</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              className="w-24 font-mono"
              data-testid="input-count"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="w-36" data-testid="select-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paragraphs">Paragraphs</SelectItem>
                <SelectItem value="sentences">Sentences</SelectItem>
                <SelectItem value="words">Words</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} data-testid="btn-generate">
            <RefreshCw className="h-4 w-4 mr-1" /> Generate
          </Button>
        </CardContent>
      </Card>

      {output && (
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>Output</span>
              <Button variant="ghost" size="sm" onClick={copy} data-testid="btn-copy">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 bg-muted/10 max-h-[500px] overflow-auto">
            <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="output-lorem">{output}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
