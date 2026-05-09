import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Home } from "@/pages/home";
import { Verify } from "@/pages/verify";
import { Register } from "@/pages/register";
import { Registry } from "@/pages/registry";
import { RegistryDetail } from "@/pages/registry-detail";
import { Verifications } from "@/pages/verifications";
import { Review } from "@/pages/review";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/verify" component={Verify} />
      <Route path="/register" component={Register} />
      <Route path="/registry" component={Registry} />
      <Route path="/registry/:id" component={RegistryDetail} />
      <Route path="/verifications" component={Verifications} />
      <Route path="/review" component={Review} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
