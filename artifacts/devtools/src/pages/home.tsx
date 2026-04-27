import { useState, useMemo } from "react";
import { tools, CATEGORIES, type ToolCategory } from "@/lib/tools";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ToolCategory | "All">("All");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return tools.filter((t) => {
      const matchesCategory = activeCategory === "All" || t.category === activeCategory;
      const matchesQuery = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.id.includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query, activeCategory]);

  const grouped = useMemo(() => {
    if (activeCategory !== "All" || query.trim()) return null;
    const map = new Map<ToolCategory, typeof tools>();
    for (const cat of CATEGORIES) {
      const items = tools.filter((t) => t.category === cat);
      if (items.length > 0) map.set(cat, items);
    }
    return map;
  }, [activeCategory, query]);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Developer Toolkit</h1>
        <p className="text-muted-foreground mt-2">
          Precision tools for everyday coding tasks. Fast, precise, uncluttered.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search"
            placeholder="Search tools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["All", ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              data-testid={`filter-${cat}`}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {grouped ? (
        <div className="space-y-8">
          {[...grouped.entries()].map(([cat, items]) => (
            <div key={cat}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{cat}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground" data-testid="empty-state">
          No tools match your search.
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool }: { tool: (typeof tools)[number] }) {
  const Icon = tool.icon;
  return (
    <Link href={tool.path}>
      <Card
        data-testid={`card-${tool.id}`}
        className="h-full hover:border-primary/50 transition-colors cursor-pointer hover:bg-muted/50"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-5 w-5 text-primary shrink-0" />
            {tool.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-2">
          <CardDescription className="text-sm">{tool.description}</CardDescription>
          <Badge variant="secondary" className="text-[10px] shrink-0">{tool.category}</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
