import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "~/db.server";
import { proxyChatRequest } from "./backend.server";
import type { ProductInfo } from "./scanner.server";
import { v4 as uuidv4 } from "uuid";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentConfig {
  agentName: string;
  businessName: string;
  businessDesc: string;
  supportFile: string;
  escalationEmail: string;
  escalationMessage: string;
  escalationTopics: string[];
  refundPolicy: string;
  licensePolicy: string;
  deliveryPolicy: string;
}

interface ProcessChatResult {
  reply: string;
  toolCalls?: ToolCallResult[];
}

interface ToolCallResult {
  name: string;
  result: unknown;
}

// Tool definitions for Anthropic tool_use
const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "generate_quote",
    description:
      "Generate a checkout quote link for a product when the buyer is ready to purchase.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_id: {
          type: "string",
          description: "The Shopify product ID (GID)",
        },
        variant_id: {
          type: "string",
          description: "The Shopify variant ID (GID)",
        },
        product_name: {
          type: "string",
          description: "The product name for display",
        },
        quantity: {
          type: "number",
          description: "Quantity to purchase",
          default: 1,
        },
      },
      required: ["product_id", "variant_id", "product_name"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Escalate the conversation to a human support agent when the issue requires human intervention.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description: "The reason for escalation",
        },
        topic: {
          type: "string",
          description: "The support topic category",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "search_products",
    description:
      "Search for products in the store catalog to help the buyer find what they need.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
];

/**
 * Build the system prompt for the AI agent.
 */
export function buildSystemPrompt(
  buyerType: "human" | "agent",
  config: AgentConfig,
  products: ProductInfo[],
): string {
  const productList = products
    .map(
      (p) =>
        `- ${p.title} (${p.id}): ${p.description || "No description"} — Variants: ${p.variants.map((v) => `$${v.price}`).join(", ")}`,
    )
    .join("\n");

  const policies = [
    config.refundPolicy ? `Refund Policy: ${config.refundPolicy}` : "",
    config.licensePolicy ? `License Policy: ${config.licensePolicy}` : "",
    config.deliveryPolicy ? `Delivery Policy: ${config.deliveryPolicy}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const escalationInfo = config.escalationTopics.length
    ? `Escalation topics: ${config.escalationTopics.join(", ")}`
    : "";

  return `You are ${config.agentName}, an AI sales and support agent for ${config.businessName}.

${config.businessDesc}

Your role:
- Help buyers find the right products
- Answer questions about products, pricing, and policies
- Generate checkout links when buyers are ready to purchase
- Escalate to human support when needed (${config.escalationMessage})
${escalationInfo}

${buyerType === "agent" ? "You are communicating with another AI agent (A2A protocol). Be structured and concise." : "You are chatting with a human buyer. Be friendly, helpful, and conversational."}

Available Products:
${productList}

${policies}

${config.supportFile ? `Additional Support Information:\n${config.supportFile}` : ""}

Guidelines:
- Always be accurate about product information and pricing
- If you don't know something, say so honestly
- Use the generate_quote tool when a buyer decides to purchase
- Use the escalate_to_human tool for issues you cannot resolve
- Never make up product information or pricing`;
}

/**
 * Detect whether the incoming message is from a human or an AI agent.
 */
export function detectBuyerType(
  message: string,
  userAgent?: string,
): "human" | "agent" {
  // Check for A2A protocol indicators
  if (userAgent?.includes("A2A-Client")) return "agent";
  if (message.startsWith('{"jsonrpc"')) return "agent";
  return "human";
}

/**
 * Process a chat message and return the AI response.
 */
export async function processChat(
  shop: string,
  message: string,
  sessionId: string,
  buyerType: "human" | "agent" = "human",
  testMode: boolean = false,
): Promise<ProcessChatResult> {
  const install = await prisma.install.findUnique({
    where: { shop },
    include: { config: true },
  });

  if (!install) throw new Error(`No install found for shop: ${shop}`);
  if (!install.config) throw new Error("Agent not configured yet");

  // Get or create conversation
  let conversation = await prisma.conversation.findUnique({
    where: { sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        installId: install.id,
        sessionId,
        buyerType,
        firstMessage: message,
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  // Save user message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: message,
    },
  });

  // Build message history
  const messages: ChatMessage[] = conversation.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  messages.push({ role: "user", content: message });

  // Get products from scan cache
  const scanCache = install.config.scanCache as Record<string, unknown>;
  const products = (scanCache.products as ProductInfo[]) || [];

  const systemPrompt = buildSystemPrompt(buyerType, install.config, products);

  let result: ProcessChatResult;

  if (install.tier === "turnkey") {
    // TurnKey: proxy through backend
    result = await processTurnkeyChat(shop, messages, systemPrompt);
  } else {
    // BYOK: call Anthropic directly
    if (!install.apiKey) {
      throw new Error("No API key configured. Please add your Anthropic API key in settings.");
    }
    result = await processByokChat(install.apiKey, messages, systemPrompt, testMode);
  }

  // Save assistant message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: result.reply,
    },
  });

  return result;
}

async function processByokChat(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt: string,
  testMode: boolean,
): Promise<ProcessChatResult> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    tools: AGENT_TOOLS,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  let reply = "";
  const toolCalls: ToolCallResult[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      reply += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        name: block.name,
        result: block.input,
      });
    }
  }

  return { reply, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
}

async function processTurnkeyChat(
  shop: string,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<ProcessChatResult> {
  const data = await proxyChatRequest(shop, messages, systemPrompt, AGENT_TOOLS);
  return {
    reply: data.reply,
    toolCalls: data.toolCalls,
  };
}

/**
 * Process a generate_quote tool call — create a Shopify checkout URL.
 */
export async function processQuoteToolCall(
  shop: string,
  input: { product_id: string; variant_id: string; product_name: string; quantity?: number },
  conversationId: string,
): Promise<{ checkoutUrl: string; quoteLinkId: string }> {
  // Create a quote link record
  const quoteLink = await prisma.quoteLink.create({
    data: {
      conversationId,
      productId: input.product_id,
      productName: input.product_name,
      amount: 0, // Will be updated when order completes
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  });

  // Generate a Shopify checkout URL via cart permalink
  // Format: https://shop.myshopify.com/cart/VARIANT_ID:QUANTITY
  const variantNumericId = input.variant_id.replace(
    "gid://shopify/ProductVariant/",
    "",
  );
  const quantity = input.quantity || 1;
  const checkoutUrl = `https://${shop}/cart/${variantNumericId}:${quantity}`;

  await prisma.quoteLink.update({
    where: { id: quoteLink.id },
    data: { checkoutUrl },
  });

  // Update conversation with quote info
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      outcome: "quote",
      quoteLinkId: quoteLink.id,
      productName: input.product_name,
    },
  });

  return { checkoutUrl, quoteLinkId: quoteLink.id };
}
