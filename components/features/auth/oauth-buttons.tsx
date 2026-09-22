"use client";

import { Button } from "@/components/ui/button";
import { signInWithOAuth } from "@/lib/actions/auth.actions";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.85z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M16.36 1.43c0 1.14-.42 2.2-1.15 3.02-.83.93-2.13 1.65-3.31 1.55-.15-1.1.42-2.26 1.13-3.02.8-.86 2.2-1.55 3.33-1.55zM20.5 17.34c-.58 1.3-.86 1.88-1.6 3.03-1.04 1.6-2.5 3.6-4.32 3.61-1.61.02-2.03-1.05-4.21-1.04-2.19.01-2.65 1.06-4.26 1.04-1.82-.02-3.2-1.82-4.24-3.41C-1.02 16.86-.6 10.1 2.87 7.65c1.3-.93 2.72-.96 3.98-.4 1 .45 1.72.7 2.55.7.79 0 1.65-.31 2.83-.75 1.36-.5 2.86-.43 4.02.24 1.3.75 2.15 1.9 2.5 3.28-2.4 1.29-2.02 4.62.25 5.62-.34.99-.79 1.96-1.5 2.99z" />
    </svg>
  );
}

export function OAuthButtons() {
  const [isPending, startTransition] = useTransition();
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);

  const handleOAuthSignIn = (provider: "google" | "apple") => {
    setLoadingProvider(provider);
    startTransition(async () => {
      await signInWithOAuth(provider);
    });
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        className="h-11 bg-background/50 backdrop-blur-sm border-border/50 hover:bg-background/80 hover:shadow-md transition-all duration-300 flex items-center justify-center gap-2"
        onClick={() => handleOAuthSignIn("google")}
      >
        {isPending && loadingProvider === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <GoogleIcon />
        )}
        <span className="font-medium">Google</span>
      </Button>
      
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        className="h-11 bg-background/50 backdrop-blur-sm border-border/50 hover:bg-background/80 hover:shadow-md transition-all duration-300 flex items-center justify-center gap-2"
        onClick={() => handleOAuthSignIn("apple")}
      >
        {isPending && loadingProvider === "apple" ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <AppleIcon />
        )}
        <span className="font-medium">Apple</span>
      </Button>
    </div>
  );
}