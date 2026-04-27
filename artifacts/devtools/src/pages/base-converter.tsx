import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type Base = 2 | 8 | 10 | 16;

const BASES: { base: Base; label: string; chars: RegExp }[] = [
  { base: 2,  label: "Binary (Base 2)",   chars: /^[01]+$/ },
  { base: 8,  label: "Octal (Base 8)",    chars: /^[0-7]+$/ },
  { base: 10, label: "Decimal (Base 10)", chars: /^\d+$/ },
  { base: 16, label: "Hex (Base 16)",     chars: /^[0-9a-fA-F]+$/ },
];

interface ConversionResult {
  binary: string;
  octal: string;
  decimal: string;
  hex: string;
  decimalNum: number;
}

function groupBinary(bin: string, groupSize = 4): string {
  const padded = bin.padStart(Math.ceil(bin.length / groupSize) * groupSize, "0");
  const groups: string[] = [];
  for (let i = 0; i < padded.length; i += groupSize) {
    groups.push(padded.slice(i, i + groupSize));
  }
  return groups.join(" ");
}

function BitwiseView({ decimalNum }: { decimalNum: number }) {
  const { toast } = useToast();
  const [maskInput, setMaskInput] = useState("255");

  const mask = parseInt(maskInput, 10);
  const validMask = !isNaN(mask) && mask >= 0 && mask <= 0xFFFFFFFF;

  const ops = validMask
    ? [
        { label: "NOT", symbol: "~", result: (~decimalNum) >>> 0, title: "Bitwise NOT (unsigned 32-bit)" },
        { label: `AND ${maskInput}`, symbol: "&", result: (decimalNum & mask) >>> 0, title: `Bitwise AND with ${maskInput}` },
        { label: `OR ${maskInput}`, symbol: "|", result: (decimalNum | mask) >>> 0, title: `Bitwise OR with ${maskInput}` },
        { label: `XOR ${maskInput}`, symbol: "^", result: (decimalNum ^ mask) >>> 0, title: `Bitwise XOR with ${maskInput}` },
      ]
    : [];

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: "Copied", description: "Value copied." });
  };

  const bin32 = (decimalNum >>> 0).toString(2).padStart(32, "0");
  const byte3 = bin32.slice(0, 8);
  const byte2 = bin32.slice(8, 16);
  const byte1 = bin32.slice(16, 24);
  const byte0 = bin32.slice(24, 32);

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/20">
        <CardTitle className="text-sm font-medium">Bitwise View (32-bit unsigned)</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="overflow-x-auto">
          <div className="font-mono text-xs space-y-1 min-w-max" data-testid="output-bitwise">
            <div className="flex gap-2 text-muted-foreground">
              <span className="w-12">Bits</span>
              <span>31-24</span><span className="ml-3">23-16</span><span className="ml-3">15-8</span><span className="ml-3">7-0</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="w-12 text-muted-foreground">Binary</span>
              {[byte3, byte2, byte1, byte0].map((byte, i) => (
                <span key={i} className="tracking-widest text-primary">{byte}</span>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <span className="w-12 text-muted-foreground">Hex</span>
              {[byte3, byte2, byte1, byte0].map((byte, i) => (
                <span key={i} className="text-blue-400 w-12">{parseInt(byte, 2).toString(16).padStart(2, "0").toUpperCase()}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Label className="text-xs shrink-0">Mask (decimal)</Label>
            <Input
              className="w-32 font-mono text-sm h-8"
              value={maskInput}
              onChange={(e) => setMaskInput(e.target.value)}
              placeholder="e.g. 255"
              data-testid="input-mask"
            />
          </div>
          {ops.length > 0 && (
            <div className="grid grid-cols-2 gap-2" data-testid="list-bitops">
              {ops.map(({ label, symbol, result, title }) => (
                <div key={label} className="p-2 rounded-md bg-muted/20 border border-border group" title={title}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{symbol} ({label})</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => copy(String(result))}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="font-mono text-sm font-medium" data-testid={`bitop-${symbol}`}>{result}</div>
                  <div className="font-mono text-xs text-muted-foreground">{result.toString(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
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
        decimalNum: decimal,
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
        { label: "Binary",      value: groupBinary(result.binary),         id: "binary",  base: 2 },
        { label: "Octal",       value: result.octal,                        id: "octal",   base: 8 },
        { label: "Decimal",     value: result.decimal,                      id: "decimal", base: 10 },
        { label: "Hexadecimal", value: result.hex,                          id: "hex",     base: 16 },
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Number Base Converter</h1>
        <p className="text-muted-foreground mt-1">Convert numbers between binary, octal, decimal, and hexadecimal, with bitwise operations.</p>
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

      {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-mono" data-testid="text-error">{error}</div>}

      {outputs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="list-conversions">
          {outputs.map(({ label, value, id, base }) => (
            <Card key={id} className="border-border shadow-sm" data-testid={`card-${id}`}>
              <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between items-center">
                  <span>{label} (Base {base})</span>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => copy(value.replace(/ /g, ""), label)} data-testid={`btn-copy-${id}`}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 bg-muted/10">
                <code className="font-mono text-sm break-all text-foreground tracking-wider" data-testid={`output-${id}`}>
                  {value}
                </code>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {result && <BitwiseView decimalNum={result.decimalNum} />}
    </div>
  );
}
