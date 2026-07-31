/**
 * Billing modes that mint a provider-hosted pay-link, mapped to the gateway
 * that backs them.
 *
 * "later" is the card option. It raises the invoice AND emails a Telr Hosted
 * Payment Page link, which is why the modal labels it "Invoice + card
 * pay-link" rather than the old "Invoice - pay later": a link now goes out to
 * the customer, and staff should not be surprised by that.
 */
export type PayLinkGateway = "tabby" | "tamara" | "telr";

export const GATEWAY_LABEL: Record<PayLinkGateway, string> = {
  tabby: "Tabby",
  tamara: "Tamara",
  telr: "Card",
};

/** The gateway backing a billing mode, or null when the mode is not a pay-link. */
export function payLinkGatewayFor(billingMode: string): PayLinkGateway | null {
  if (billingMode === "later") return "telr";
  if (billingMode === "tabby") return "tabby";
  if (billingMode === "tamara") return "tamara";
  return null;
}
