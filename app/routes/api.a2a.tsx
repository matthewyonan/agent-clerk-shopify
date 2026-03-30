import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { handleA2ARequest, getAgentCard } from "~/lib/a2a.server";

/**
 * A2A protocol endpoint.
 *
 * GET /.well-known/agent-card.json — returns the Agent Card
 * POST /api/a2a — handles JSON-RPC A2A requests
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // Serve the Agent Card on GET
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }

  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
  const agentCard = getAgentCard(shop, appUrl);

  return json(agentCard, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Missing shop parameter" } },
      { status: 400 },
    );
  }

  const body = await request.json();

  // Validate JSON-RPC format
  if (!body.jsonrpc || body.jsonrpc !== "2.0" || !body.method) {
    return json(
      {
        jsonrpc: "2.0",
        id: body.id || null,
        error: { code: -32600, message: "Invalid JSON-RPC request" },
      },
      { status: 400 },
    );
  }

  const response = await handleA2ARequest(shop, body);

  return json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
