import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  DataTable,
  Badge,
  Banner,
  Link,
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
  if (!install) return json({ escalations: [], config: null });

  const escalations = await prisma.conversation.findMany({
    where: {
      installId: install.id,
      outcome: { in: ["escalated", "support"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return json({
    escalations: escalations.map((e) => ({
      id: e.id,
      firstMessage: e.firstMessage,
      outcome: e.outcome,
      lastMessage: e.messages[0]?.content || "",
      updatedAt: e.updatedAt.toISOString(),
    })),
    config: {
      escalationEmail: install.config?.escalationEmail || "",
      escalationMessage: install.config?.escalationMessage || "",
      escalationTopics: install.config?.escalationTopics || [],
    },
  });
}

export default function Support() {
  const { escalations, config } = useLoaderData<typeof loader>();

  const rows = escalations.map((e) => [
    e.firstMessage?.slice(0, 60) || "—",
    e.outcome === "escalated" ? (
      <Badge tone="warning">Escalated</Badge>
    ) : (
      <Badge tone="info">Support</Badge>
    ),
    e.lastMessage.slice(0, 80) || "—",
    new Date(e.updatedAt).toLocaleDateString(),
  ]);

  return (
    <Page title="Support & Escalations">
      <BlockStack gap="500">
        {config && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Escalation Settings</Text>
              <Text as="p" variant="bodyMd">
                Email: {config.escalationEmail || "Not configured"}
              </Text>
              <Text as="p" variant="bodyMd">
                Message: {config.escalationMessage}
              </Text>
              {config.escalationTopics.length > 0 && (
                <Text as="p" variant="bodyMd">
                  Topics: {config.escalationTopics.join(", ")}
                </Text>
              )}
              <Link url="/app/settings/support">Edit escalation settings</Link>
            </BlockStack>
          </Card>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Recent Escalations
                </Text>
                {rows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["First Message", "Status", "Last Message", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Banner tone="info">
                    <p>No escalations yet. Your AI agent is handling everything!</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
