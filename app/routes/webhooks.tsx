import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";
import { notifyBackend, reportSale } from "~/lib/backend.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await handleAppUninstalled(shop);
      break;

    case "ORDERS_CREATE":
    case "ORDERS_PAID":
      await handleOrderCompleted(shop, payload);
      break;

    case "PRODUCTS_CREATE":
    case "PRODUCTS_UPDATE":
    case "PRODUCTS_DELETE":
      await invalidateProductCache(shop);
      break;
  }

  return new Response();
}

async function handleAppUninstalled(shop: string) {
  // Mark install as inactive
  const install = await prisma.install.findUnique({ where: { shop } });
  if (install) {
    await prisma.install.update({
      where: { shop },
      data: { pluginStatus: "suspended" },
    });

    // Notify backend
    try {
      await notifyBackend(shop, "uninstall");
    } catch {
      // Best-effort notification
    }
  }

  // Clean up sessions
  await prisma.session.deleteMany({ where: { shop } });
}

async function handleOrderCompleted(shop: string, payload: any) {
  const install = await prisma.install.findUnique({ where: { shop } });
  if (!install) return;

  const orderId = payload.admin_graphql_api_id || payload.id;
  const orderAmount = parseFloat(payload.total_price || "0");

  // Check if this order came from an AgentClerk quote link
  const quoteLink = await prisma.quoteLink.findFirst({
    where: {
      orderId: null,
      status: "pending",
      expiresAt: { gte: new Date() },
    },
  });

  if (quoteLink) {
    // Match by checking if order line items include the quoted product
    const lineItems = payload.line_items || [];
    const matchingItem = lineItems.find((item: any) => {
      const variantGid = `gid://shopify/ProductVariant/${item.variant_id}`;
      const productGid = `gid://shopify/Product/${item.product_id}`;
      return productGid === quoteLink.productId;
    });

    if (matchingItem) {
      // Calculate agent fee (percentage of sale)
      const feeRate = 0.03; // 3% default
      const agentFee = orderAmount * feeRate;

      // Update quote link
      await prisma.quoteLink.update({
        where: { id: quoteLink.id },
        data: { orderId: String(orderId), status: "completed", amount: orderAmount },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: quoteLink.conversationId },
        data: {
          outcome: "purchased",
          saleAmount: orderAmount,
          agentFee,
        },
      });

      // Update accrued fees
      await prisma.install.update({
        where: { shop },
        data: { accruedFees: { increment: agentFee } },
      });

      // Report to backend
      try {
        await reportSale(shop, quoteLink.conversationId, orderAmount, String(orderId));
      } catch {
        // Best-effort
      }
    }
  }
}

async function invalidateProductCache(shop: string) {
  const install = await prisma.install.findUnique({
    where: { shop },
    include: { config: true },
  });

  if (install?.config) {
    // Mark scan cache as stale by clearing products
    const scanCache = (install.config.scanCache as Record<string, unknown>) || {};
    await prisma.agentConfig.update({
      where: { installId: install.id },
      data: {
        scanCache: { ...scanCache, stale: true },
      },
    });
  }
}
