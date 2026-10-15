import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows a friendly message with a reload button instead of a blank page if rendering fails. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OpenFlyover crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex h-full items-center justify-center p-8">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
          <p className="text-slate-300">
            OpenFlyover hit an unexpected error. Your files never left this device, so reloading is
            safe. If it keeps happening, please report it with the message below.
          </p>
          <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-left text-xs text-red-200">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => location.reload()}
            className="rounded-md bg-orange-700 px-4 py-2 font-semibold text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
