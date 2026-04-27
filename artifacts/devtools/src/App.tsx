import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";

// Pages
import Home from "@/pages/home";
import Json from "@/pages/json";
import Base64 from "@/pages/base64";
import Url from "@/pages/url";
import Jwt from "@/pages/jwt";
import Uuid from "@/pages/uuid";
import Hash from "@/pages/hash";
import Timestamp from "@/pages/timestamp";
import Color from "@/pages/color";
import Regex from "@/pages/regex";
import Markdown from "@/pages/markdown";
import Diff from "@/pages/diff";
import Lorem from "@/pages/lorem";
import Case from "@/pages/case";
import Cron from "@/pages/cron";
import QueryString from "@/pages/querystring";
import Beautifier from "@/pages/beautifier";
import QrCode from "@/pages/qrcode";
import BaseConverter from "@/pages/base-converter";
import About from "@/pages/about";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/json" component={Json} />
        <Route path="/base64" component={Base64} />
        <Route path="/url" component={Url} />
        <Route path="/jwt" component={Jwt} />
        <Route path="/uuid" component={Uuid} />
        <Route path="/hash" component={Hash} />
        <Route path="/timestamp" component={Timestamp} />
        <Route path="/color" component={Color} />
        <Route path="/regex" component={Regex} />
        <Route path="/markdown" component={Markdown} />
        <Route path="/diff" component={Diff} />
        <Route path="/lorem" component={Lorem} />
        <Route path="/case" component={Case} />
        <Route path="/cron" component={Cron} />
        <Route path="/querystring" component={QueryString} />
        <Route path="/beautifier" component={Beautifier} />
        <Route path="/qrcode" component={QrCode} />
        <Route path="/base-converter" component={BaseConverter} />
        <Route path="/about" component={About} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="devtools-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
