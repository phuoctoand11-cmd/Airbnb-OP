import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { I18nProvider } from "@/i18n";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Listings from "@/pages/listings";
import ListingDetail from "@/pages/listing-detail";
import Bookings from "@/pages/bookings";
import Tasks from "@/pages/tasks";
import Revenues from "@/pages/revenues";
import Expenses from "@/pages/expenses";
import Reports from "@/pages/reports";
import UsersPage from "@/pages/users";
import ChatPage from "@/pages/chat";
import AvailabilityCalendar from "@/pages/availability-calendar";
import HRRecruitment from "@/pages/hr";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function RootRedirect() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session ? <Redirect to="/dashboard" /> : <Redirect to="/login" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={Login} />

      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/listings">
        <ProtectedRoute>
          <Listings />
        </ProtectedRoute>
      </Route>
      <Route path="/listings/:id">
        <ProtectedRoute>
          <ListingDetail />
        </ProtectedRoute>
      </Route>

      <Route path="/bookings">
        <ProtectedRoute permission="manageBookings">
          <Bookings />
        </ProtectedRoute>
      </Route>

      <Route path="/tasks">
        <ProtectedRoute permission="manageTasks">
          <Tasks />
        </ProtectedRoute>
      </Route>

      <Route path="/revenues">
        <ProtectedRoute permission="manageFinance">
          <Revenues />
        </ProtectedRoute>
      </Route>

      <Route path="/expenses">
        <ProtectedRoute permission="manageFinance">
          <Expenses />
        </ProtectedRoute>
      </Route>

      <Route path="/reports">
        <ProtectedRoute permission="viewReports">
          <Reports />
        </ProtectedRoute>
      </Route>

      <Route path="/settings/users">
        <ProtectedRoute permission="manageUsers">
          <UsersPage />
        </ProtectedRoute>
      </Route>

      <Route path="/chat">
        <ProtectedRoute>
          <ChatPage />
        </ProtectedRoute>
      </Route>

      <Route path="/calendar">
        <ProtectedRoute>
          <AvailabilityCalendar />
        </ProtectedRoute>
      </Route>

      <Route path="/hr">
        <ProtectedRoute>
          <HRRecruitment />
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
