import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  Button,
  Banner,
  DataTable,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";
import { getBillingStatus, createLicenseCheckout } from "~/lib/billing.server";
import { PromoCodeInput } from "~/components/PromoCodeInput";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const install = await prisma.install.findUnique({ where: { shop } });
  if (!install) return json({ billing: null, sales: [], totalRevenue: 0 });

  const billing = await getBillingStatus(shop);

  const sales = await prisma.conversation.findMany({
    where: { installId: install.id, outcome: "purchased" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      productName: true,
      saleAmount: true,
      agentFee: true,
      updatedAt: true,
    },
  });

  const totalRevenue = await prisma.conversation.aggregate({
    where: { installId: install.id, outcome: "purchased" },
    _sum: { saleAmount: true, agentFee: true },
  });

  return json({
    billing,
    sales: sales.map((s) => ({
      ...s,
      updatedAt: s.updatedAt.toISOString(),
    })),
    totalRevenue: totalRevenue._sum.saleAmount || 0,
    totalFees: totalRevenue._sum.agentFee || 0,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (actionType === "checkout") {
    const promoCode = formData.get("promoCode") as string;
    const result = await createLicenseCheckout(shop, promoCode || undefined);

    if (result.url) {
      return json({ redirect: result.url });
    }
    if (result.activated) {
      return json({ activated: true });
    }
    return json({ error: result.error || "Checkout failed" });
  }

  return json({ error: "Invalid action" });
}

export default function Sales() {
  const { billing, sales, totalRevenue, totalFees } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const rows = sales.map((s) => [
    s.productName || "Unknown",
    `$${(s.saleAmount ?? 0).toFixed(2)}`,
    `$${(s.agentFee ?? 0).toFixed(2)}`,
    new Date(s.updatedAt).toLocaleDateString(),
  ]);

  // Handle redirect to Stripe
  if (actionData?.redirect) {
    window.open(actionData.redirect, "_blank");
  }

  return (
    <Page title="Sales & Billing">
      <BlockStack gap="500">
        {actionData?.activated && (
          <Banner title="License Activated!" tone="success" onDismiss={() => {}}>
            <p>Your TurnKey license has been activated successfully.</p>
          </Banner>
        )}

        {actionData?.error && (
          <Banner title="Error" tone="critical" onDismiss={() => {}}>
            <p>{actionData.error}</p>
          </Banner>
        )}

        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Total Revenue</Text>
              <Text as="p" variant="headingXl">${totalRevenue.toFixed(2)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Agent Fees</Text>
              <Text as="p" variant="headingXl">${(totalFees ?? 0).toFixed(2)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">License</Text>
              <Badge tone={billing?.licenseStatus === "active" ? "success" : "attention"}>
                {billing?.licenseStatus || "None"}
              </Badge>
              <Text as="p" variant="bodySm">Tier: {billing?.tier || "—"}</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {billing?.tier === "turnkey" && billing?.licenseStatus !== "active" && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Get a License</Text>
              <Text as="p" variant="bodyMd">
                A TurnKey license gives you access to the AgentClerk AI backend
                without needing your own API key.
              </Text>
              <PromoCodeInput
                onSubmit={(promoCode) => {
                  const formData = new FormData();
                  formData.set("_action", "checkout");
                  if (promoCode) formData.set("promoCode", promoCode);
                  submit(formData, { method: "post" });
                }}
                loading={navigation.state === "submitting"}
              />
            </BlockStack>
          </Card>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Sales History</Text>
                {rows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "text"]}
                    headings={["Product", "Amount", "Fee", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Text as="p" tone="subdued">No sales recorded yet.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
