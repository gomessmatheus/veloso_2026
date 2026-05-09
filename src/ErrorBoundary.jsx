import { Component } from "react";
import { RED, B1, LN, TX, TX2, B2 } from "../constants/tokens.js";

/**
 * Wraps a subtree and catches render errors,
 * showing a recovery UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ padding: 40, maxWidth: 600 }}>
        <div style={{
          background: "#FFF1F2", border: "1px solid #FCA5A5",
          borderRadius: 10, padding: 24,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginBottom: 8 }}>
            Erro na renderização
          </div>
          <div style={{
            fontSize: 12, color: TX, marginBottom: 16,
            fontFamily: "monospace", background: B2, padding: 12,
            borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {String(this.state.error)}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: RED, border: "none", borderRadius: 6,
              padding: "7px 14px", color: "#fff", fontSize: 12,
              fontWeight: 700, cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}
