import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  DataTable,
  Checkbox,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";
import { scanStore, type ProductInfo } from "~/lib/scanner.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const install = await prisma.install.findUnique({
    where: { shop: session.shop },
    include: { config: true },
  });

  if (!install?.config) return json({ products: [], visibility: {}, lastScan: null });

  const scanCache = install.config.scanCache as Record<string, unknown>;
  const products = (scanCache.products as ProductInfo[]) || [];
  const visibility = (install.config.productVisibility as Record<string, boolean>) || {};

  return json({
    products,
    visibility,
    lastScan: install.lastScanDate?.toISOString() || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  const install = await prisma.install.findUnique({
    where: { shop: session.shop },
  });
  if (!install) return json({ error: "Not installed" }, { status: 400 });

  if (actionType === "rescan") {
    const scanResult = await scanStore(admin);
    await prisma.agentConfig.update({
      where: { installId: install.id },
      data: { scanCache: scanResult as any },
    });
    await prisma.install.update({
      where: { shop: session.shop },
      data: { lastScanDate: new Date() },
    });
    return json({ success: true, rescanned: true });
  }

  if (actionType === "visibility") {
    const visibility = JSON.parse(formData.get("visibility") as string);
    await prisma.agentConfig.update({
      where: { installId: install.id },
      data: { productVisibility: visibility },
    });
    return json({ success: true });
  }

  return json({ error: "Invalid action" });
}

export default function SettingsCatalog() {
  const { products, visibility, lastScan } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [vis, setVis] = useState<Record<string, boolean>>(visibility);

  const toggleVisibility = useCallback(
    (productId: string) => {
      setVis((prev) => ({ ...prev, [productId]: !prev[productId] }));
    },
    [],
  );

  const rows = products.map((p: ProductInfo) => [
    p.title,
    p.productType || "—",
    p.variants[0]?.price ? `$${p.variants[0].price}` : "—",
    p.status,
    <Checkbox
      key={p.id}
      label=""
      labelHidden
      checked={vis[p.id] !== false}
      onChange={() => toggleVisibility(p.id)}
    />,
  ]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Product Catalog</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Last scanned: {lastScan ? new Date(lastScan).toLocaleString() : "Never"}
        </Text>
        <Button
          loading={navigation.state === "submitting"}
          onClick={() => {
            const formData = new FormData();
            formData.set("_action", "rescan");
            submit(formData, { method: "post" });
          }}
        >
          Re-scan Store
        </Button>

        {products.length > 0 ? (
          <>
            <DataTable
              columnContentTypes={["text", "text", "numeric", "text", "text"]}
              headings={["Product", "Type", "Price", "Status", "Visible to Agent"]}
              rows={rows}
            />
            <Button
              variant="primary"
              onClick={() => {
                const formData = new FormData();
                formData.set("_action", "visibility");
                formData.set("visibility", JSON.stringify(vis));
                submit(formData, { method: "post" });
              }}
            >
              Save Visibility
            </Button>
          </>
        ) : (
          <Banner tone="info">
            <p>No products found. Scan your store to import products.</p>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}
