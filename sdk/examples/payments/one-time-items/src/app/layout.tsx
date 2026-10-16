import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PaymentSync } from "@/components/eazo-payments/PaymentSync";

export const metadata: Metadata = {
  title: "Eazo One-Time Items Example",
  description: "One payment for several items using @eazo/sdk/payments"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PaymentSync />
        {children}
      </body>
    </html>
  );
}
