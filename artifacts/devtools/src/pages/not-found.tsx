import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-4">
      <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Page Not Found</h1>
        <p className="text-muted-foreground text-sm">That tool doesn't exist.</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
