import React, { Component } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Pass `resetKey` (e.g. pathname + hash) so a crash on one route does not
 * stick when the user navigates away. `compact` renders an inline panel for
 * a single staff view instead of the full-page card.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`ErrorBoundary${this.props.name ? ` (${this.props.name})` : ""} caught an error:`, error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <div className="aym-error-card" role="alert" style={{ margin: "2rem auto", maxWidth: 560 }}>
            <div className="aym-error-icon">
              <AlertCircle size={32} aria-hidden="true" />
            </div>
            <h2 className="aym-display">{this.props.name || "This view"} hit a problem</h2>
            <p>The rest of the staff workspace still works. Try again, or switch to another view.</p>
            <div className="aym-error-actions">
              <button type="button" className="aym-btn aym-btn-primary" onClick={this.handleReset}>
                <RefreshCw size={16} aria-hidden="true" /> Try again
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="aym-error-boundary">
          <div className="aym-error-card">
            <div className="aym-error-icon">
              <AlertCircle size={40} aria-hidden="true" />
            </div>
            <h1 className="aym-display">We couldn't load this content</h1>
            <p>
              An unexpected error occurred while loading this section of AYURDISHA.
              Please try reloading or return to the homepage.
            </p>
            <div className="aym-error-actions">
              <button type="button" className="aym-btn aym-btn-primary" onClick={this.handleReset}>
                <RefreshCw size={16} aria-hidden="true" /> Try again
              </button>
              <Link to="/" className="aym-btn aym-btn-outline" onClick={this.handleReset}>
                <Home size={16} aria-hidden="true" /> Back to Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
