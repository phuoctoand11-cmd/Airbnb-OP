import { useState } from "react";
import QRCode from "qrcode";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, QrCode as QrIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export default function QrCodePage() {
  const [input, setInput] = useState("https://example.com");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [svgString, setSvgString] = useState<string | null>(null);
  const [size, setSize] = useState(300);
  const [errorLevel, setErrorLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const generate = async () => {
    if (!input.trim()) return;
    try {
      const [url, svg] = await Promise.all([
        QRCode.toDataURL(input.trim(), {
          width: size,
          errorCorrectionLevel: errorLevel,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        }),
        QRCode.toString(input.trim(), {
          type: "svg",
          errorCorrectionLevel: errorLevel,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        }),
      ]);
      setDataUrl(url);
      setSvgString(svg);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate QR code");
      setDataUrl(null);
      setSvgString(null);
    }
  };

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qrcode.png";
    a.click();
    toast({ title: "Downloaded", description: "QR code saved as qrcode.png" });
  };

  const downloadSvg = () => {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qrcode.svg";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "QR code saved as qrcode.svg" });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">QR Code Generator</h1>
        <p className="text-muted-foreground mt-1">Generate QR codes from any text or URL. Download as PNG or SVG.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-medium">Input</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com or any text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              data-testid="input-qrcode"
            />
            <Button onClick={generate} data-testid="btn-generate">
              <QrIcon className="h-4 w-4 mr-1" /> Generate
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Size: {size}px</Label>
              <Slider
                min={100}
                max={600}
                step={50}
                value={[size]}
                onValueChange={([v]) => setSize(v)}
                data-testid="slider-size"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Error Correction</Label>
              <Select value={errorLevel} onValueChange={(v) => setErrorLevel(v as typeof errorLevel)}>
                <SelectTrigger data-testid="select-error-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">L — Low (7%)</SelectItem>
                  <SelectItem value="M">M — Medium (15%)</SelectItem>
                  <SelectItem value="Q">Q — Quartile (25%)</SelectItem>
                  <SelectItem value="H">H — High (30%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-error">{error}</div>
      )}

      {dataUrl && (
        <Card className="border-border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              <span>QR Code</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadPng} data-testid="btn-download-png">
                  <Download className="h-4 w-4 mr-1" /> PNG
                </Button>
                <Button variant="outline" size="sm" onClick={downloadSvg} data-testid="btn-download-svg">
                  <Download className="h-4 w-4 mr-1" /> SVG
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex justify-center bg-white rounded-b-lg">
            <img
              src={dataUrl}
              alt="QR Code"
              className="rounded-md shadow-sm"
              style={{ imageRendering: "pixelated", maxWidth: "100%" }}
              data-testid="img-qrcode"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
