import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  DataTable,
  Badge,
  Pagination,
  Filters,
  ChoiceList,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";

const PAGE_SIZE = 20;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const outcome = url.searchParams.get("outcome") || undefined;

  const install = await prisma.install.findUnique({ where: { shop } });
  if (!install) return json({ conversations: [], total: 0, page: 1 });

  const where = {
    installId: install.id,
    ...(outcome ? { outcome } : {}),
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  return json({
    conversations: conversations.map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      buyerType: c.buyerType,
      firstMessage: c.firstMessage,
      productName: c.productName,
      outcome: c.outcome,
      saleAmount: c.saleAmount,
      messageCount: c._count.messages,
      startedAt: c.startedAt.toISOString(),
    })),
    total,
    page,
  });
}

function outcomeBadge(outcome: string) {
  switch (outcome) {
    case "purchased":
      return <Badge tone="success">Purchased</Badge>;
    case "quote":
      return <Badge tone="attention">Quote Sent</Badge>;
    case "escalated":
      return <Badge tone="warning">Escalated</Badge>;
    case "support":
      return <Badge tone="info">Support</Badge>;
    case "abandoned":
      return <Badge>Abandoned</Badge>;
    default:
      return <Badge>{outcome}</Badge>;
  }
}

export default function Conversations() {
  const { conversations, total, page } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [outcomeFilter, setOutcomeFilter] = useState<string[]>(
    searchParams.get("outcome") ? [searchParams.get("outcome")!] : [],
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const rows = conversations.map((c) => [
    c.firstMessage?.slice(0, 60) || "—",
    c.buyerType,
    c.productName || "—",
    outcomeBadge(c.outcome),
    c.saleAmount ? `$${c.saleAmount.toFixed(2)}` : "—",
    c.messageCount,
    new Date(c.startedAt).toLocaleDateString(),
  ]);

  const handleOutcomeChange = useCallback(
    (value: string[]) => {
      setOutcomeFilter(value);
      const params = new URLSearchParams(searchParams);
      if (value.length) {
        params.set("outcome", value[0]);
      } else {
        params.delete("outcome");
      }
      params.set("page", "1");
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  return (
    <Page title="Conversations">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Filters
                queryValue=""
                onQueryChange={() => {}}
                onQueryClear={() => {}}
                onClearAll={() => {
                  setOutcomeFilter([]);
                  setSearchParams({ page: "1" });
                }}
                filters={[
                  {
                    key: "outcome",
                    label: "Outcome",
                    filter: (
                      <ChoiceList
                        title="Outcome"
                        titleHidden
                        choices={[
                          { label: "Browsing", value: "browsing" },
                          { label: "Quote", value: "quote" },
                          { label: "Purchased", value: "purchased" },
                          { label: "Support", value: "support" },
                          { label: "Escalated", value: "escalated" },
                          { label: "Abandoned", value: "abandoned" },
                        ]}
                        selected={outcomeFilter}
                        onChange={handleOutcomeChange}
                      />
                    ),
                    shortcut: true,
                  },
                ]}
              />
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "numeric",
                  "numeric",
                  "text",
                ]}
                headings={[
                  "First Message",
                  "Buyer",
                  "Product",
                  "Outcome",
                  "Sale",
                  "Messages",
                  "Date",
                ]}
                rows={rows}
              />
              {totalPages > 1 && (
                <Box padding="400">
                  <Pagination
                    hasPrevious={page > 1}
                    hasNext={page < totalPages}
                    onPrevious={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("page", String(page - 1));
                      setSearchParams(params);
                    }}
                    onNext={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("page", String(page + 1));
                      setSearchParams(params);
                    }}
                  />
                </Box>
              )}
              <Text as="p" variant="bodySm" tone="subdued">
                {total} conversation{total !== 1 ? "s" : ""} total
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
