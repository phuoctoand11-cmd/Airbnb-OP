import type { ComponentType } from "react";
import {
  Braces,
  Binary,
  Link as LinkIcon,
  KeyRound,
  Fingerprint,
  Hash,
  Clock,
  Palette,
  Regex,
  FileText,
  FileDiff,
  Type,
  CaseSensitive,
  CalendarDays,
  List,
  Code2,
  QrCode,
  Calculator,
} from "lucide-react";

export type ToolCategory = "Encoding" | "Crypto & IDs" | "Web" | "Text" | "Numbers & Colors" | "Code";

export interface Tool {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  category: ToolCategory;
}

export const tools: Tool[] = [
  { id: "json",          name: "JSON Formatter",       description: "Format, minify, and validate JSON data",         path: "/json",          icon: Braces,       category: "Code" },
  { id: "base64",        name: "Base64 Encode/Decode", description: "Encode and decode text or files to Base64",       path: "/base64",        icon: Binary,       category: "Encoding" },
  { id: "url",           name: "URL Encode/Decode",    description: "Encode and decode URL-safe strings",             path: "/url",           icon: LinkIcon,     category: "Encoding" },
  { id: "jwt",           name: "JWT Decoder",          description: "Decode JSON Web Tokens, highlight expiry",       path: "/jwt",           icon: KeyRound,     category: "Encoding" },
  { id: "uuid",          name: "UUID Generator",       description: "Generate v4 and v7 UUIDs",                      path: "/uuid",          icon: Fingerprint,  category: "Crypto & IDs" },
  { id: "hash",          name: "Hash Generator",       description: "Generate MD5, SHA-1, SHA-256, SHA-512 hashes",  path: "/hash",          icon: Hash,         category: "Crypto & IDs" },
  { id: "timestamp",     name: "Timestamp Converter",  description: "Convert Unix timestamps to dates and back",      path: "/timestamp",     icon: Clock,        category: "Numbers & Colors" },
  { id: "color",         name: "Color Converter",      description: "Convert between HEX, RGB, and HSL",             path: "/color",         icon: Palette,      category: "Numbers & Colors" },
  { id: "regex",         name: "Regex Tester",         description: "Test regular expressions against text",         path: "/regex",         icon: Regex,        category: "Code" },
  { id: "markdown",      name: "Markdown Preview",     description: "Write and preview Markdown with GFM",           path: "/markdown",      icon: FileText,     category: "Text" },
  { id: "diff",          name: "Text Diff",            description: "Compare two texts and highlight differences",   path: "/diff",          icon: FileDiff,     category: "Text" },
  { id: "lorem",         name: "Lorem Ipsum",          description: "Generate placeholder text",                     path: "/lorem",         icon: Type,         category: "Text" },
  { id: "case",          name: "Case Converter",       description: "Convert text between naming conventions",       path: "/case",          icon: CaseSensitive, category: "Text" },
  { id: "cron",          name: "Cron Explainer",       description: "Explain cron expressions and show next runs",   path: "/cron",          icon: CalendarDays, category: "Code" },
  { id: "querystring",   name: "Query String Parser",  description: "Parse and build URL query strings",             path: "/querystring",   icon: List,         category: "Web" },
  { id: "beautifier",    name: "Code Beautifier",      description: "Format or minify HTML, CSS, and JS",           path: "/beautifier",    icon: Code2,        category: "Code" },
  { id: "qrcode",        name: "QR Code Generator",    description: "Generate QR codes, download PNG or SVG",       path: "/qrcode",        icon: QrCode,       category: "Web" },
  { id: "base-converter", name: "Base Converter",      description: "Convert numbers between bin/oct/dec/hex",      path: "/base-converter", icon: Calculator,  category: "Numbers & Colors" },
];

export const CATEGORIES: ToolCategory[] = ["Encoding", "Crypto & IDs", "Web", "Text", "Numbers & Colors", "Code"];
