import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Box,
  Banner,
  Button,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const install = await prisma.install.findUnique({
    where: { shop },
    include: { config: true },
  });

  if (!install) {
    return json({ needsSetup: true, stats: null, install: null });
  }

  // Get conversation stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalConversations, todayConversations, totalSales, recentSales] =
    await Promise.all([
      prisma.conversation.count({ where: { installId: install.id } }),
      prisma.conversation.count({
        where: { installId: install.id, startedAt: { gte: today } },
      }),
      prisma.conversation.count({
        where: { installId: install.id, outcome: "purchased" },
      }),
      prisma.conversation.findMany({
        where: { installId: install.id, outcome: "purchased" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { productName: true, saleAmount: true, updatedAt: true },
      }),
    ]);

  const totalRevenue = await prisma.conversation.aggregate({
    where: { installId: install.id, outcome: "purchased" },
    _sum: { saleAmount: true },
  });

  return json({
    needsSetup: install.pluginStatus === "onboarding",
    stats: {
      totalConversations,
      todayConversations,
      totalSales,
      totalRevenue: totalRevenue._sum.saleAmount || 0,
      recentSales,
    },
    install: {
      tier: install.tier,
      pluginStatus: install.pluginStatus,
      billingStatus: install.billingStatus,
      agentName: install.config?.agentName || "AgentClerk",
    },
  });
}

export default function Dashboard() {
  const { needsSetup, stats, install } = useLoaderData<typeof loader>();

  if (needsSetup) {
    return (
      <Page title="Welcome to AgentClerk">
        <Layout>
          <Layout.Section>
            <Banner
              title="Complete your setup"
              tone="info"
              action={{ content: "Start Setup", url: "/app/setup" }}
            >
              <p>
                Set up your AI sales agent to start helping buyers and closing
                sales.
              </p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Conversations Today
              </Text>
              <Text as="p" variant="headingXl">
                {stats?.todayConversations ?? 0}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Total Conversations
              </Text>
              <Text as="p" variant="headingXl">
                {stats?.totalConversations ?? 0}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Total Sales
              </Text>
              <Text as="p" variant="headingXl">
                {stats?.totalSales ?? 0}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Revenue
              </Text>
              <Text as="p" variant="headingXl">
                ${(stats?.totalRevenue ?? 0).toFixed(2)}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Recent Sales
                </Text>
                {stats?.recentSales?.length ? (
                  <BlockStack gap="200">
                    {stats.recentSales.map((sale, i) => (
                      <Box key={i} padding="200" borderColor="border" borderWidth="025" borderRadius="100">
                        <InlineGrid columns={3}>
                          <Text as="span" variant="bodyMd">
                            {sale.productName || "Unknown Product"}
                          </Text>
                          <Text as="span" variant="bodyMd">
                            ${(sale.saleAmount ?? 0).toFixed(2)}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(sale.updatedAt).toLocaleDateString()}
                          </Text>
                        </InlineGrid>
                      </Box>
                    ))}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">
                    No sales yet. Your AI agent is ready to start selling!
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Agent Status
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Agent: {install?.agentName}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Tier: {install?.tier === "byok" ? "Bring Your Own Key" : "TurnKey"}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Status: {install?.pluginStatus}
                  </Text>
                </BlockStack>
                <Button url="/app/settings">Manage Settings</Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
