import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { clientLog } from "@/lib/clientLog";

interface Props { children: ReactNode }
interface State { error: Error | null }

/** Catches render-phase React errors, records them in the client log store, and renders a
 *  minimal recovery UI. Non-render errors are captured separately via clientLog.install(). */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    clientLog.add({
      level: "boundary",
      source: "ErrorBoundary",
      message: error.message,
      stack: error.stack,
      meta: { componentStack: info.componentStack },
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-destructive/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-semibold">Something broke</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The error was recorded in the Owner Console → Client logs. You can retry, or reload
            the page if the issue keeps recurring.
          </p>
          <pre className="text-[11px] font-mono text-muted-foreground bg-secondary/50 p-2 rounded-lg overflow-auto max-h-40">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button onClick={this.reset} className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
            <button onClick={() => window.location.reload()} className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl border border-border hover:bg-secondary">
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
