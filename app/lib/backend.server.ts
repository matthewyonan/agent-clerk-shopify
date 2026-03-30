import { prisma } from "~/db.server";

const BACKEND_URL =
  process.env.AGENTCLERK_BACKEND_URL || "https://app.agentclerk.io/api";

/**
 * Make an authenticated request to the AgentClerk backend.
 */
export async function backendRequest(
  shop: string,
  endpoint: string,
  options: RequestInit = {},
) {
  const install = await prisma.install.findUnique({ where: { shop } });
  if (!install) {
    throw new Error(`No install found for shop: ${shop}`);
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-AgentClerk-Secret": install.installSecret,
      "X-AgentClerk-Site": `https://${install.shopDomain}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Backend request failed: ${response.status} ${response.statusText} - ${text}`,
    );
  }

  return response.json();
}

/**
 * Register a new Shopify store install with the backend.
 */
export async function registerInstall(
  shop: string,
  shopDomain: string,
): Promise<{ installSecret: string }> {
  const response = await fetch(`${BACKEND_URL}/install/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      site: `https://${shopDomain}`,
      platform: "shopify",
      shop,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to register install: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Notify the backend of an event (e.g., uninstall, sale).
 */
export async function notifyBackend(
  shop: string,
  event: string,
  data: Record<string, unknown> = {},
) {
  return backendRequest(shop, `/events/${event}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Report a sale to the backend for fee tracking.
 */
export async function reportSale(
  shop: string,
  conversationId: string,
  amount: number,
  orderId: string,
) {
  return backendRequest(shop, "/sales/report", {
    method: "POST",
    body: JSON.stringify({ conversationId, amount, orderId }),
  });
}

/**
 * Get billing/license status from the backend.
 */
export async function getBillingStatus(shop: string) {
  return backendRequest(shop, "/billing/status");
}

/**
 * Proxy a chat request through the backend (TurnKey tier).
 */
export async function proxyChatRequest(
  shop: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  tools: unknown[],
) {
  return backendRequest(shop, "/chat/proxy", {
    method: "POST",
    body: JSON.stringify({ messages, systemPrompt, tools }),
  });
}
