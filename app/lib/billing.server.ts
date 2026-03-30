import { prisma } from "~/db.server";
import { backendRequest } from "./backend.server";

export interface BillingStatus {
  tier: string;
  licenseStatus: string;
  licenseKey: string | null;
  billingStatus: string;
  accruedFees: number;
}

/**
 * Get billing status for a shop.
 */
export async function getBillingStatus(shop: string): Promise<BillingStatus> {
  const install = await prisma.install.findUnique({ where: { shop } });
  if (!install) throw new Error(`No install found for shop: ${shop}`);

  return {
    tier: install.tier,
    licenseStatus: install.licenseStatus,
    licenseKey: install.licenseKey,
    billingStatus: install.billingStatus,
    accruedFees: install.accruedFees,
  };
}

/**
 * Create a license checkout session via the backend.
 */
export async function createLicenseCheckout(
  shop: string,
  promoCode?: string,
): Promise<{ url?: string; activated?: boolean; error?: string }> {
  const install = await prisma.install.findUnique({ where: { shop } });
  if (!install) throw new Error(`No install found for shop: ${shop}`);

  const result = await backendRequest(shop, "/license/checkout", {
    method: "POST",
    body: JSON.stringify({
      successUrl: `https://${install.shopDomain}/admin/apps/agentclerk?license_success=1`,
      cancelUrl: `https://${install.shopDomain}/admin/apps/agentclerk/sales`,
      promoCode: promoCode || undefined,
    }),
  });

  // Handle instant activation (100% promo)
  if (result.activated) {
    await prisma.install.update({
      where: { shop },
      data: {
        licenseStatus: "active",
        licenseKey: result.licenseKey,
        tier: "turnkey",
      },
    });
  }

  return result;
}

/**
 * Verify and activate a license key.
 */
export async function activateLicense(
  shop: string,
  licenseKey: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await backendRequest(shop, "/license/activate", {
    method: "POST",
    body: JSON.stringify({ licenseKey }),
  });

  if (result.success) {
    await prisma.install.update({
      where: { shop },
      data: {
        licenseStatus: "active",
        licenseKey,
        tier: "turnkey",
      },
    });
  }

  return result;
}

/**
 * Update the tier (BYOK or TurnKey).
 */
export async function updateTier(
  shop: string,
  tier: "byok" | "turnkey",
): Promise<void> {
  await prisma.install.update({
    where: { shop },
    data: { tier },
  });
}

/**
 * Save an Anthropic API key for BYOK tier.
 */
export async function saveApiKey(
  shop: string,
  apiKey: string,
): Promise<void> {
  await prisma.install.update({
    where: { shop },
    data: { apiKey },
  });
}

/**
 * Get accrued fees summary.
 */
export async function getAccruedFees(
  shop: string,
): Promise<{ total: number; recentSales: number }> {
  const install = await prisma.install.findUnique({
    where: { shop },
    include: {
      conversations: {
        where: { outcome: "purchased" },
        orderBy: { updatedAt: "desc" },
        take: 50,
      },
    },
  });

  if (!install) throw new Error(`No install found for shop: ${shop}`);

  return {
    total: install.accruedFees,
    recentSales: install.conversations.length,
  };
}
