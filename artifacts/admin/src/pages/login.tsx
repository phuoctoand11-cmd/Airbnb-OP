import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Building2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AppRole } from "@/lib/supabase";
import { ROLES } from "@/lib/supabase";
import { useI18n, type Lang } from "@/i18n";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const DEBUG_SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "(not set)";
const DEBUG_ANON_KEY_LOADED = Boolean(
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
);

/** Mirrors the sidebar switcher so signed-out users can pick a language too. */
const LANG_OPTIONS: { value: Lang; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const { signIn, signUp, blockError } = useAuth();
  const { toast } = useToast();
  const { t, lang, setLang } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6, t.login.passwordMin),
  });

  const registerSchema = loginSchema.extend({
    fullName: z.string().min(2, t.login.fullNameMin),
    role: z.enum(["admin", "manager", "accountant", "sales", "maintenance", "cleaner", "staff"] as const),
  });

  type LoginFormValues = z.infer<typeof loginSchema>;
  type RegisterFormValues = z.infer<typeof registerSchema>;

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", fullName: "", role: "staff" },
  });

  const onLogin = async (data: LoginFormValues) => {
    try {
      setIsLoading(true);
      await signIn(data.email, data.password);
      setLocation("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: t.login.loginFailed,
        description: (error as Error).message || t.login.invalidCredentials,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (data: RegisterFormValues) => {
    try {
      setIsLoading(true);
      await signUp(data.email, data.password, data.fullName, data.role as AppRole);
      toast({
        title: t.login.accountCreated,
        description: t.login.successRegistered,
      });
      setActiveTab("login");
      loginForm.setValue("email", data.email);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t.login.registerFailed,
        description: (error as Error).message || t.login.couldNotCreate,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">

        {/* Language switcher — signed-out users have no sidebar to reach it from */}
        <div className="mb-4 flex justify-end gap-1">
          {LANG_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${t.login.language}: ${opt.label}`}
              aria-pressed={lang === opt.value}
              onClick={() => setLang(opt.value)}
              className={`h-8 rounded-lg px-2.5 text-xs ${
                lang === opt.value
                  ? "bg-muted font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <span className="mr-1.5 text-sm">{opt.flag}</span>
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Logo + headline */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-background shadow-md mb-5">
            <Building2 className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {t.login.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.login.subtitle}</p>
        </div>

        {/* Debug banner */}
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="mb-1 font-semibold uppercase tracking-wide text-amber-700 text-[10px]">
            {t.login.debugTitle}
          </div>
          <div className="break-all">
            <span className="font-medium">SUPABASE_URL:</span> {DEBUG_SUPABASE_URL}
          </div>
          <div>
            <span className="font-medium">{t.login.anonKeyLoaded}</span>{" "}
            {DEBUG_ANON_KEY_LOADED ? t.common.yes : t.common.no}
          </div>
        </div>

        {blockError && (
          <Alert variant="destructive" className="mb-5 rounded-xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{blockError}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")}>
          <TabsList className="grid w-full grid-cols-2 mb-5 rounded-xl bg-card">
            <TabsTrigger value="login" className="rounded-lg">
              {t.login.loginTab}
            </TabsTrigger>
            <TabsTrigger value="register" className="rounded-lg">
              {t.login.registerTab}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold tracking-tight">
                  {t.login.welcomeBack}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {t.login.enterCredentials}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">
                            {t.login.email}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="you@company.com"
                              className="rounded-xl border-border bg-background h-11"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">
                            {t.login.password}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              className="rounded-xl border-border bg-background h-11"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 transition-colors"
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {t.login.loginBtn}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold tracking-tight">
                  {t.login.createAccount}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {t.login.signUpDesc}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl bg-muted px-3 py-2.5 mb-4 text-xs text-muted-foreground">
                  {t.login.roleNote}
                </div>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">
                            {t.login.fullName}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Jane Doe"
                              className="rounded-xl border-border bg-background h-11"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">
                            {t.login.email}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="you@company.com"
                              className="rounded-xl border-border bg-background h-11"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">
                            {t.login.password}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              className="rounded-xl border-border bg-background h-11"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">
                            {t.common.role}
                          </FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-xl border-border bg-background h-11">
                                <SelectValue placeholder={t.login.selectRole} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {t.roles[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 transition-colors"
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {t.login.registerBtn}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
