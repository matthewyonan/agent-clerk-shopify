import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { processChat, processQuoteToolCall, detectBuyerType } from "~/lib/agent.server";
import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";

/**
 * Chat API endpoint — receives messages from the storefront widget via App Proxy.
 *
 * App Proxy requests are authenticated by Shopify with HMAC signature.
 * URL: /apps/agentclerk/chat → proxied to /api/chat
 */
export async function action({ request }: ActionFunctionArgs) {
  // Verify the App Proxy HMAC signature
  const url = new URL(request.url);
  const signature = url.searchParams.get("signature");
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }

  // Verify HMAC if signature present (App Proxy sends it)
  if (signature && process.env.SHOPIFY_API_SECRET) {
    const params = new URLSearchParams(url.searchParams);
    params.delete("signature");
    params.sort();
    const message = params.toString();
    const hmac = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
      .update(message)
      .digest("hex");

    if (hmac !== signature) {
      return json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  const body = await request.json();
  const {
    message,
    sessionId = uuidv4(),
    testMode = false,
  } = body as {
    message: string;
    sessionId?: string;
    testMode?: boolean;
  };

  if (!message) {
    return json({ error: "Message is required" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") || "";
  const buyerType = detectBuyerType(message, userAgent);

  const result = await processChat(shop, message, sessionId, buyerType, testMode);

  // Handle tool calls (e.g., generate_quote)
  if (result.toolCalls) {
    for (const tool of result.toolCalls) {
      if (tool.name === "generate_quote") {
        const quoteInput = tool.result as {
          product_id: string;
          variant_id: string;
          product_name: string;
          quantity?: number;
        };

        // Find the conversation to get its ID
        const conversation = await import("~/db.server").then((m) =>
          m.prisma.conversation.findUnique({ where: { sessionId } }),
        );

        if (conversation) {
          const quoteResult = await processQuoteToolCall(
            shop,
            quoteInput,
            conversation.id,
          );
          return json({
            reply: result.reply,
            checkoutUrl: quoteResult.checkoutUrl,
            sessionId,
          });
        }
      }
    }
  }

  return json({
    reply: result.reply,
    sessionId,
  });
}

// GET handler for health check
export async function loader() {
  return json({ status: "ok", service: "agentclerk-chat" });
}
