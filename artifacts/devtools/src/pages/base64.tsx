import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, ArrowRight, ArrowLeft, Upload, Download, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Base64() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; type: string } | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleEncode = () => {
    if (!input) return;
    try {
      const bytes = new TextEncoder().encode(input);
      const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
      setOutput(btoa(binary));
      setError(null);
    } catch {
      setError("Failed to encode");
    }
  };

  const handleDecode = () => {
    if (!input) return;
    try {
      const binary = atob(input.trim());
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      setOutput(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
      setError(null);
    } catch {
      setError("Invalid Base64 string");
      setOutput("");
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast({ title: "Copied", description: "Output copied to clipboard." });
  };

  const handleClear = () => {
    setInput("");
    setOutput("");
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileInfo({ name: file.name, size: file.size, type: file.type || "application/octet-stream" });
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFileDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadFile = () => {
    if (!fileDataUrl) return;
    const a = document.createElement("a");
    a.href = fileDataUrl;
    a.download = fileInfo?.name ?? "file";
    a.click();
    toast({ title: "Downloaded", description: "File saved." });
  };

  const handleDecodeToFile = () => {
    if (!input.trim()) return;
    try {
      const cleaned = input.trim().replace(/\s/g, "");
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "decoded_file";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Decoded file saved." });
    } catch {
      setError("Invalid Base64 string for file decoding");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Base64 Encode / Decode</h1>
        <p className="text-muted-foreground mt-1">Convert text or files to and from Base64.</p>
      </div>

      <Tabs defaultValue="text">
        <TabsList data-testid="tabs-mode">
          <TabsTrigger value="text" data-testid="tab-text"><FileText className="h-4 w-4 mr-1.5" />Text</TabsTrigger>
          <TabsTrigger value="file" data-testid="tab-file"><Upload className="h-4 w-4 mr-1.5" />File</TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "350px" }}>
            <Card className="flex flex-col border-border shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium flex justify-between items-center">
                  <span>Input</span>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={handleEncode} data-testid="btn-encode" className="h-7 px-2 text-xs">
                      Encode <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleDecode} data-testid="btn-decode" className="h-7 px-2 text-xs">
                      Decode <ArrowLeft className="h-3.5 w-3.5 ml-1" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleClear} data-testid="btn-clear" className="h-7 px-2 text-xs">
                      Clear
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex">
                <Textarea
                  className="flex-1 rounded-none border-0 resize-none font-mono text-sm focus-visible:ring-0 p-4 min-h-[300px]"
                  placeholder="Enter text to encode, or paste Base64 to decode..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleEncode(); }}
                  data-testid="input-base64"
                  spellCheck={false}
                />
              </CardContent>
            </Card>

            <Card className="flex flex-col border-border shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-medium flex justify-between items-center">
                  <span>Output</span>
                  <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!output} data-testid="btn-copy" className="h-7 px-2 text-xs">
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-auto bg-muted/10">
                {error ? (
                  <div className="p-4 text-destructive font-mono text-sm" data-testid="text-error">{error}</div>
                ) : (
                  <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all" data-testid="output-base64">
                    {output || <span className="text-muted-foreground italic">Output will appear here...</span>}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="file" className="mt-4 space-y-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">Encode File to Base64</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="file-drop-zone"
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Click to select a file</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Any file type supported</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-file"
              />

              {fileInfo && fileDataUrl && (
                <div className="space-y-3">
                  <div className="p-3 rounded-md bg-muted/30 text-sm flex items-center justify-between">
                    <div>
                      <span className="font-medium">{fileInfo.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{(fileInfo.size / 1024).toFixed(1)} KB · {fileInfo.type}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(fileDataUrl.split(",")[1]);
                      toast({ title: "Copied", description: "Base64 string copied." });
                    }} data-testid="btn-copy-file-b64">
                      <Copy className="h-4 w-4 mr-1" /> Copy Base64
                    </Button>
                  </div>
                  <div className="rounded-md bg-muted/10 border border-border overflow-auto max-h-40">
                    <pre className="p-3 font-mono text-xs break-all whitespace-pre-wrap" data-testid="output-file-base64">
                      {fileDataUrl.split(",")[1]}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium">Decode Base64 to File</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <Textarea
                className="font-mono text-sm resize-none min-h-[120px]"
                placeholder="Paste Base64 string here..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                data-testid="input-file-decode"
                spellCheck={false}
              />
              {error && <p className="text-destructive text-sm" data-testid="text-file-error">{error}</p>}
              <Button onClick={handleDecodeToFile} disabled={!input.trim()} data-testid="btn-decode-file">
                <Download className="h-4 w-4 mr-1" /> Decode and Download
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
