import { Component } from "react";

export default class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Admin crash:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "16px" }}>
          <h2>⚠️ Something went wrong in the Admin panel.</h2>
          <p>Try reloading the page or navigating back.</p>
          <details style={{ whiteSpace: "pre-wrap", marginTop: "8px" }}>
            {this.state.error?.toString()}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
