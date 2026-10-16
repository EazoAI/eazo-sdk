"use client";

import * as React from "react";
import { EazoEntitlementGate } from "@eazo/sdk/payments/react";
import { ItemsCheckoutButton } from "@/components/eazo-payments/ItemsCheckoutButton";

// Display copy only. The server prices lines from PAYMENT_ITEMS in
// src/lib/eazo-payments/items.ts; the browser sends ids and quantities.
const ITEMS = [
  { id: "item_a", name: "Item A", price: "$4.99", entitlement: true },
  { id: "item_b", name: "Item B", price: "$1.99", entitlement: false },
];

export default function ItemsPage() {
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const lines = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => ({ id, quantity }));

  function change(id: string, delta: number) {
    const max = ITEMS.find((item) => item.id === id)?.entitlement ? 1 : 999;
    setQuantities((current) => ({
      ...current,
      [id]: Math.min(max, Math.max(0, (current[id] ?? 0) + delta)),
    }));
  }

  return (
    <main style={{ maxWidth: 480, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui" }}>
      <h1>Pay for several items</h1>
      <p>Use this as a working payment reference. Match the final styling to the app.</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {ITEMS.map((item) => (
          <li key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
            <span style={{ flex: 1 }}>
              {item.name} · {item.price}
            </span>
            <button type="button" onClick={() => change(item.id, -1)} aria-label={`Remove ${item.name}`}>
              −
            </button>
            <span>{quantities[item.id] ?? 0}</span>
            <button type="button" onClick={() => change(item.id, 1)} aria-label={`Add ${item.name}`}>
              +
            </button>
          </li>
        ))}
      </ul>
      <ItemsCheckoutButton lines={lines}>Pay</ItemsCheckoutButton>
      <EazoEntitlementGate productKey="item_a" paid={<p>Item A active.</p>} free={<p>Item A not paid yet.</p>} />
    </main>
  );
}
