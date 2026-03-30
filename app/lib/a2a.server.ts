import { prisma } from "~/db.server";
import { processChat, detectBuyerType } from "./agent.server";
import { v4 as uuidv4 } from "uuid";

// A2A Protocol types
interface A2ARequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface A2AResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
  }>;
}

/**
 * Generate the Agent Card for a shop.
 */
export function getAgentCard(shopDomain: string, appUrl: string): AgentCard {
  return {
    name: "AgentClerk",
    description:
      "AI sales and support agent that helps buyers find products, generates quotes, and handles support.",
    url: `${appUrl}/api/a2a`,
    version: "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: [
      {
        id: "product-search",
        name: "Product Search",
        description: "Search and browse products in the store catalog",
        tags: ["shopping", "products", "search"],
        examples: [
          "What products do you have?",
          "Show me items under $50",
          "Do you have any blue widgets?",
        ],
      },
      {
        id: "purchase-assistance",
        name: "Purchase Assistance",
        description:
          "Help buyers complete purchases by generating checkout links",
        tags: ["sales", "checkout", "purchase"],
        examples: [
          "I'd like to buy the Premium Widget",
          "Can you create a checkout link?",
        ],
      },
      {
        id: "support",
        name: "Customer Support",
        description:
          "Answer questions about orders, policies, and product information",
        tags: ["support", "help", "faq"],
        examples: [
          "What is your refund policy?",
          "How long does shipping take?",
        ],
      },
    ],
  };
}

/**
 * Handle an A2A JSON-RPC request.
 */
export async function handleA2ARequest(
  shop: string,
  request: A2ARequest,
): Promise<A2AResponse> {
  switch (request.method) {
    case "tasks/send":
      return handleTaskSend(shop, request);
    case "tasks/get":
      return handleTaskGet(shop, request);
    case "tasks/cancel":
      return handleTaskCancel(shop, request);
    default:
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
  }
}

async function handleTaskSend(
  shop: string,
  request: A2ARequest,
): Promise<A2AResponse> {
  const params = request.params || {};
  const taskId = (params.id as string) || uuidv4();
  const sessionId = (params.sessionId as string) || uuidv4();
  const message = params.message as
    | { role: string; parts: Array<{ type: string; text: string }> }
    | undefined;

  if (!message?.parts?.length) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32602, message: "Missing message with text parts" },
    };
  }

  const install = await prisma.install.findUnique({ where: { shop } });
  if (!install) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32000, message: "Shop not configured" },
    };
  }

  const textContent = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  // Create or find the A2A task
  let task = await prisma.a2ATask.findFirst({
    where: { id: taskId, installId: install.id },
  });

  if (!task) {
    task = await prisma.a2ATask.create({
      data: {
        id: taskId,
        installId: install.id,
        sessionId,
        contextId: params.contextId as string | undefined,
        status: "TASK_STATE_WORKING",
      },
    });
  } else {
    await prisma.a2ATask.update({
      where: { id: task.id },
      data: { status: "TASK_STATE_WORKING" },
    });
  }

  // Save incoming message
  await prisma.a2AMessage.create({
    data: {
      taskId: task.id,
      messageId: uuidv4(),
      role: "ROLE_USER",
      content: textContent,
    },
  });

  // Process via agent
  const result = await processChat(shop, textContent, sessionId, "agent");

  // Save agent response
  const responseMessageId = uuidv4();
  await prisma.a2AMessage.create({
    data: {
      taskId: task.id,
      messageId: responseMessageId,
      role: "ROLE_AGENT",
      content: result.reply,
    },
  });

  // Update task status
  await prisma.a2ATask.update({
    where: { id: task.id },
    data: { status: "TASK_STATE_COMPLETED" },
  });

  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      id: task.id,
      contextId: task.contextId,
      sessionId: task.sessionId,
      status: { state: "TASK_STATE_COMPLETED" },
      messages: [
        {
          messageId: responseMessageId,
          role: "ROLE_AGENT",
          parts: [{ type: "text", text: result.reply }],
        },
      ],
      artifacts: result.toolCalls
        ? [
            {
              artifactId: uuidv4(),
              name: "tool_results",
              parts: [
                {
                  type: "text",
                  text: JSON.stringify(result.toolCalls),
                },
              ],
            },
          ]
        : [],
    },
  };
}

async function handleTaskGet(
  shop: string,
  request: A2ARequest,
): Promise<A2AResponse> {
  const taskId = request.params?.id as string;
  if (!taskId) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32602, message: "Missing task id" },
    };
  }

  const task = await prisma.a2ATask.findUnique({
    where: { id: taskId },
    include: { messages: true, artifacts: true },
  });

  if (!task) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32001, message: "Task not found" },
    };
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      id: task.id,
      contextId: task.contextId,
      sessionId: task.sessionId,
      status: { state: task.status },
      messages: task.messages.map((m) => ({
        messageId: m.messageId,
        role: m.role,
        parts: [{ type: "text", text: m.content }],
      })),
      artifacts: task.artifacts.map((a) => ({
        artifactId: a.artifactId,
        name: a.name,
        parts: JSON.parse(a.partsJson),
      })),
    },
  };
}

async function handleTaskCancel(
  shop: string,
  request: A2ARequest,
): Promise<A2AResponse> {
  const taskId = request.params?.id as string;
  if (!taskId) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32602, message: "Missing task id" },
    };
  }

  const task = await prisma.a2ATask.findFirst({
    where: { id: taskId },
  });

  if (!task) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32001, message: "Task not found" },
    };
  }

  await prisma.a2ATask.update({
    where: { id: task.id },
    data: { status: "TASK_STATE_CANCELED" },
  });

  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      id: task.id,
      status: { state: "TASK_STATE_CANCELED" },
    },
  };
}
