import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Real error state instead of a blank screen. Saved games stay in storage. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('EASY JAWI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center bg-cream-100 p-6 text-center" role="alert">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-semibold text-navy-900">Alamak, ada ralat</h1>
          <p className="mt-2 text-ink-soft">Sesuatu tidak berjalan seperti dijangka. Permainan anda masih tersimpan pada peranti ini.</p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-white p-3 text-left text-xs text-coral-700">{this.state.error.message}</pre>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" className="btn-3d min-h-12 rounded-xl bg-navy-800 px-5 font-display font-semibold text-white" onClick={() => window.location.reload()}>
              Muat semula
            </button>
            <button
              type="button"
              className="btn-3d min-h-12 rounded-xl border-2 border-cream-300 bg-white px-5 font-display font-semibold"
              onClick={() => {
                this.setState({ error: null });
                window.location.hash = '#main';
              }}
            >
              Laman utama
            </button>
          </div>
        </div>
      </div>
    );
  }
}
