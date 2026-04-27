import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function relativeLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

interface ColorResult {
  hex: string;
  rgb: string;
  hsl: string;
  r: number;
  g: number;
  b: number;
  preview: string;
}

function ContrastChecker({ r, g, b }: { r: number; g: number; b: number }) {
  const L = relativeLuminance(r, g, b);
  const contrastWhite = contrastRatio(L, 1);
  const contrastBlack = contrastRatio(L, 0);

  const Badge_ = ({ pass, label }: { pass: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      pass ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"
    }`}>
      {pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/20">
        <CardTitle className="text-sm font-medium">Contrast Checker (WCAG)</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-border flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md border border-white/20 bg-white flex-shrink-0" />
              <span className="text-sm font-medium">vs White</span>
              <span className="ml-auto font-mono text-sm font-bold" data-testid="contrast-white">{contrastWhite.toFixed(2)}:1</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge_ pass={contrastWhite >= 3} label="AA Large" />
              <Badge_ pass={contrastWhite >= 4.5} label="AA Normal" />
              <Badge_ pass={contrastWhite >= 7} label="AAA Normal" />
            </div>
          </div>
          <div className="p-3 rounded-lg border border-border flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md border border-border bg-black flex-shrink-0" />
              <span className="text-sm font-medium">vs Black</span>
              <span className="ml-auto font-mono text-sm font-bold" data-testid="contrast-black">{contrastBlack.toFixed(2)}:1</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge_ pass={contrastBlack >= 3} label="AA Large" />
              <Badge_ pass={contrastBlack >= 4.5} label="AA Normal" />
              <Badge_ pass={contrastBlack >= 7} label="AAA Normal" />
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          WCAG 2.1: AA requires 4.5:1 for normal text, 3:1 for large text. AAA requires 7:1 for normal text.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Color() {
  const [hexInput, setHexInput] = useState("");
  const [rgbInput, setRgbInput] = useState("");
  const [hslInput, setHslInput] = useState("");
  const [result, setResult] = useState<ColorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fromHex = () => {
    const rgb = hexToRgb(hexInput.trim());
    if (!rgb) { setError("Invalid HEX color"); setResult(null); return; }
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hex = hexInput.startsWith("#") ? hexInput.trim() : "#" + hexInput.trim();
    setResult({ hex: hex.toUpperCase(), rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`, preview: hex, ...rgb });
    setError(null);
  };

  const fromRgb = () => {
    const match = rgbInput.match(/(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/);
    if (!match) { setError("Invalid RGB. Use format: 255, 128, 0"); setResult(null); return; }
    const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    if ([r, g, b].some((n) => n > 255)) { setError("RGB values must be 0-255"); setResult(null); return; }
    const hsl = rgbToHsl(r, g, b);
    const hex = rgbToHex(r, g, b);
    setResult({ hex: hex.toUpperCase(), rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`, preview: hex, r, g, b });
    setError(null);
  };

  const fromHsl = () => {
    const match = hslInput.match(/(\d{1,3})[,\s]+(\d{1,3})%?[,\s]+(\d{1,3})%?/);
    if (!match) { setError("Invalid HSL. Use format: 200, 80%, 50%"); setResult(null); return; }
    const [h, s, l] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    if (h > 360 || s > 100 || l > 100) { setError("H: 0-360, S/L: 0-100"); setResult(null); return; }
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    setResult({ hex: hex.toUpperCase(), rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, hsl: `hsl(${h}, ${s}%, ${l}%)`, preview: hex, ...rgb });
    setError(null);
  };

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: "Copied", description: `${label} copied.` });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Color Converter</h1>
        <p className="text-muted-foreground mt-1">Convert colors between HEX, RGB, and HSL, and check WCAG contrast ratios.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">From HEX</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <Input placeholder="#FF8C00" value={hexInput} onChange={(e) => setHexInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fromHex()} className="font-mono" data-testid="input-hex" />
            <Button className="w-full" onClick={fromHex} data-testid="btn-from-hex">Convert</Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">From RGB</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <Input placeholder="255, 140, 0" value={rgbInput} onChange={(e) => setRgbInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fromRgb()} className="font-mono" data-testid="input-rgb" />
            <Button className="w-full" onClick={fromRgb} data-testid="btn-from-rgb">Convert</Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">From HSL</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <Input placeholder="33, 100%, 50%" value={hslInput} onChange={(e) => setHslInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fromHsl()} className="font-mono" data-testid="input-hsl" />
            <Button className="w-full" onClick={fromHsl} data-testid="btn-from-hsl">Convert</Button>
          </CardContent>
        </Card>
      </div>

      {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-error">{error}</div>}

      {result && (
        <>
          <Card className="border-border shadow-sm overflow-hidden">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">Result</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex gap-4 flex-wrap items-start">
                <div
                  className="w-24 h-24 rounded-lg border border-border shadow-inner flex-shrink-0"
                  style={{ backgroundColor: result.preview }}
                  data-testid="color-preview"
                />
                <div className="space-y-2 flex-1 min-w-0">
                  {[
                    { label: "HEX", value: result.hex, id: "hex" },
                    { label: "RGB", value: result.rgb, id: "rgb" },
                    { label: "HSL", value: result.hsl, id: "hsl" },
                  ].map(({ label, value, id }) => (
                    <div key={id} className="flex items-center justify-between p-2 rounded-md bg-muted/20">
                      <div>
                        <span className="text-xs text-muted-foreground uppercase">{label}</span>
                        <p className="font-mono text-sm" data-testid={`output-${id}`}>{value}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(value, label)} data-testid={`btn-copy-${id}`}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <ContrastChecker r={result.r} g={result.g} b={result.b} />
        </>
      )}
    </div>
  );
}
