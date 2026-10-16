"use client";

import * as React from "react";
import { startEazoItemsCheckout, type EazoCheckoutLine } from "@eazo/sdk/payments";

export type ItemsCheckoutButtonProps = {
  lines: EazoCheckoutLine[];
  children?: React.ReactNode;
  className?: string;
};

// Lines can live in React state or localStorage; payment state never does.
// The button only starts checkout; granting happens on the server.
export function ItemsCheckoutButton({ lines, children = "Checkout", className }: ItemsCheckoutButtonProps) {
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function checkout() {
    setStarting(true);
    setError("");
    try {
      await startEazoItemsCheckout(lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setStarting(false);
    }
  }

  return (
    <div>
      <button type="button" className={className} disabled={starting || lines.length === 0} onClick={checkout}>
        {children}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
