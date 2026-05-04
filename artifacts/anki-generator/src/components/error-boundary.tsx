import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-serif font-bold">Something went wrong</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              The page crashed unexpectedly. Try reloading — your data is safe.
            </p>
            {this.state.message && (
              <p className="text-xs text-muted-foreground/60 font-mono bg-muted rounded px-3 py-1.5 max-w-md mx-auto break-words">
                {this.state.message}
              </p>
            )}
          </div>
          <Button onClick={() => window.location.reload()} className="gap-2">
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
