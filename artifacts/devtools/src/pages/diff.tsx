import { useState } from "react";
import { diffLines, diffWords, type Change } from "diff";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";

type DiffMode = "line" | "word";

function WordDiffView({ changes }: { changes: Change[] }) {
  return (
    <div className="font-mono text-sm leading-relaxed p-4 whitespace-pre-wrap" data-testid="output-diff-word">
      {changes.map((change, i) => {
        if (change.added) {
          return <mark key={i} className="bg-green-500/20 text-green-800 dark:text-green-200 rounded px-0.5">{change.value}</mark>;
        }
        if (change.removed) {
          return <del key={i} className="bg-red-500/20 text-red-800 dark:text-red-400 rounded px-0.5 opacity-70">{change.value}</del>;
        }
        return <span key={i}>{change.value}</span>;
      })}
    </div>
  );
}

function LineDiffView({ changes }: { changes: Change[] }) {
  return (
    <div className="font-mono text-sm" data-testid="output-diff">
      {changes.map((change, i) => {
        const lines = change.value.split("\n").filter((_, idx, arr) => idx < arr.length - 1 || arr[arr.length - 1] !== "");
        if (change.added) {
          return lines.map((line, j) => (
            <div key={`a-${i}-${j}`} className="flex bg-green-500/10 border-l-2 border-green-500">
              <span className="select-none px-2 py-0.5 text-green-600 dark:text-green-400 min-w-[2rem] text-center">+</span>
              <span className="py-0.5 pr-4 text-green-800 dark:text-green-200 whitespace-pre">{line}</span>
            </div>
          ));
        }
        if (change.removed) {
          return lines.map((line, j) => (
            <div key={`r-${i}-${j}`} className="flex bg-red-500/10 border-l-2 border-red-500">
              <span className="select-none px-2 py-0.5 text-red-600 dark:text-red-400 min-w-[2rem] text-center">-</span>
              <span className="py-0.5 pr-4 text-red-800 dark:text-red-200 whitespace-pre line-through opacity-70">{line}</span>
            </div>
          ));
        }
        return lines.map((line, j) => (
          <div key={`u-${i}-${j}`} className="flex border-l-2 border-transparent">
            <span className="select-none px-2 py-0.5 text-muted-foreground min-w-[2rem] text-center"> </span>
            <span className="py-0.5 pr-4 text-foreground whitespace-pre">{line}</span>
          </div>
        ));
      })}
    </div>
  );
}

export default function Diff() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [mode, setMode] = useState<DiffMode>("line");

  const handleDiff = (m: DiffMode = mode) => {
    setMode(m);
    setChanges(m === "line" ? diffLines(left, right) : diffWords(left, right));
  };

  const handleSwap = () => {
    setLeft(right);
    setRight(left);
    setChanges(null);
  };

  const addedCount = changes?.filter((c) => c.added).reduce((a, c) => a + (c.count || 0), 0) ?? 0;
  const removedCount = changes?.filter((c) => c.removed).reduce((a, c) => a + (c.count || 0), 0) ?? 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Text Diff</h1>
        <p className="text-muted-foreground mt-1">Compare two texts and see what changed, line by line or word by word.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="flex flex-col border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Original</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex">
            <Textarea
              className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[220px]"
              placeholder="Paste original text..."
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              data-testid="input-original"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Modified</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex">
            <Textarea
              className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[220px]"
              placeholder="Paste modified text..."
              value={right}
              onChange={(e) => setRight(e.target.value)}
              data-testid="input-modified"
              spellCheck={false}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center items-center gap-3 flex-wrap">
        <div className="flex rounded-md border border-input overflow-hidden">
          {(["line", "word"] as DiffMode[]).map((m) => (
            <button
              key={m}
              data-testid={`btn-mode-${m}`}
              onClick={() => handleDiff(m)}
              className={`px-4 py-1.5 text-sm transition-colors capitalize ${
                mode === m && changes
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {m} diff
            </button>
          ))}
        </div>
        <Button onClick={() => handleDiff()} data-testid="btn-diff">
          <ArrowLeftRight className="h-4 w-4 mr-2" /> Compare
        </Button>
        <Button variant="outline" onClick={handleSwap} data-testid="btn-swap" title="Swap original and modified">
          Swap
        </Button>
      </div>

      {changes && (
        <Card className="border-border shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex items-center gap-3">
              <span>Diff ({mode})</span>
              {addedCount > 0 && (
                <span className="text-xs font-mono text-green-600 dark:text-green-400" data-testid="text-added">+{addedCount} added</span>
              )}
              {removedCount > 0 && (
                <span className="text-xs font-mono text-red-600 dark:text-red-400" data-testid="text-removed">-{removedCount} removed</span>
              )}
              {addedCount === 0 && removedCount === 0 && (
                <span className="text-xs text-muted-foreground">No differences</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 bg-muted/10 overflow-auto max-h-[500px]">
            {mode === "word"
              ? <WordDiffView changes={changes} />
              : <LineDiffView changes={changes} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
