import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type Base = 2 | 8 | 10 | 16;

const BASES: { base: Base; label: string; prefix: string; chars: RegExp }[] = [
  { base: 2,  label: "Binary (Base 2)",  prefix: "0b", chars: /^[01]+$/ },
  { base: 8,  label: "Octal (Base 8)",   prefix: "0o", chars: /^[0-7]+$/ },
  { base: 10, label: "Decimal (Base 10)", prefix: "",  chars: /^\d+$/ },
  { base: 16, label: "Hex (Base 16)",    prefix: "0x", chars: /^[0-9a-fA-F]+$/ },
];

interface ConversionResult {
  binary: string;
  octal: string;
  decimal: string;
  hex: string;
}

export default function BaseConverter() {
  const [input, setInput] = useState("");
  const [fromBase, setFromBase] = useState<Base>(10);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const convert = () => {
    if (!input.trim()) return;
    const clean = input.trim();
    const baseInfo = BASES.find((b) => b.base === fromBase)!;
    if (!baseInfo.chars.test(clean)) {
      setError(`Invalid characters for base ${fromBase}`);
      setResult(null);
      return;
    }
    try {
      const decimal = parseInt(clean, fromBase);
      if (isNaN(decimal) || decimal > Number.MAX_SAFE_INTEGER) {
        setError("Number too large or invalid");
        setResult(null);
        return;
      }
      setResult({
        binary: decimal.toString(2),
        octal: decimal.toString(8),
        decimal: decimal.toString(10),
        hex: decimal.toString(16).toUpperCase(),
      });
      setError(null);
    } catch {
      setError("Conversion failed");
      setResult(null);
    }
  };

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: "Copied", description: `${label} value copied.` });
  };

  const outputs: { label: string; value: string; id: string; base: number }[] = result
    ? [
        { label: "Binary", value: result.binary, id: "binary", base: 2 },
        { label: "Octal", value: result.octal, id: "octal", base: 8 },
        { label: "Decimal", value: result.decimal, id: "decimal", base: 10 },
        { label: "Hexadecimal", value: result.hex.toUpperCase(), id: "hex", base: 16 },
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Number Base Converter</h1>
        <p className="text-muted-foreground mt-1">Convert numbers between binary, octal, decimal, and hexadecimal.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Input</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs">From Base</Label>
              <Select value={String(fromBase)} onValueChange={(v) => setFromBase(Number(v) as Base)}>
                <SelectTrigger data-testid="select-from-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASES.map(({ base, label }) => (
                    <SelectItem key={base} value={String(base)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-[2] min-w-[180px]">
              <Label className="text-xs">Number</Label>
              <Input
                placeholder={fromBase === 16 ? "e.g. FF" : fromBase === 2 ? "e.g. 1010" : fromBase === 8 ? "e.g. 17" : "e.g. 255"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && convert()}
                className="font-mono"
                data-testid="input-number"
              />
            </div>
            <Button onClick={convert} data-testid="btn-convert">
              <Calculator className="h-4 w-4 mr-1" /> Convert
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-mono" data-testid="text-error">{error}</div>
      )}

      {outputs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="list-conversions">
          {outputs.map(({ label, value, id, base }) => (
            <Card key={id} className="border-border shadow-sm" data-testid={`card-${id}`}>
              <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between items-center">
                  <span>{label} (Base {base})</span>
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
                <code className="font-mono text-sm break-all text-foreground" data-testid={`output-${id}`}>
                  {value}
                </code>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
