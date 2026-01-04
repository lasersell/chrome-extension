import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Unexpected error"
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Extension UI crashed", error, info);
  }

  handleReset = () => {
    try {
      chrome.storage?.local?.clear(() => {
        window.location.reload();
      });
    } catch {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="panel-atmosphere panel-grid flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-lg border border-border/60 bg-card/90 p-5 text-center shadow-lg shadow-black/20">
          <div className="text-lg font-semibold text-foreground">
            Something went wrong
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            The LaserSell extension hit an unexpected error.
          </p>
          <button
            className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            onClick={this.handleReset}
            type="button"
          >
            Reset Extension
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            Check chrome://extensions -&gt; Inspect views -&gt; Side panel console
          </p>
        </div>
      </div>
    );
  }
}
