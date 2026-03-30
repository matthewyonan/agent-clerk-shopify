import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { Card, BlockStack, TextField, Button, Banner, Text, Badge } from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";
import { saveApiKey, updateTier } from "~/lib/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const install = await prisma.install.findUnique({
    where: { shop: session.shop },
  });

  return json({
    tier: install?.tier || "byok",
    hasApiKey: !!install?.apiKey,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const apiKey = formData.get("apiKey") as string;

  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return json({ error: "Invalid API key. It should start with sk-ant-" });
  }

  await saveApiKey(session.shop, apiKey);
  return json({ success: true });
}

export default function SettingsApiKey() {
  const { tier, hasApiKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [apiKey, setApiKey] = useState("");

  if (tier !== "byok") {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">API Key</Text>
          <Banner tone="info">
            <p>
              You're on the TurnKey tier — no API key needed. The AgentClerk
              backend handles AI requests for you.
            </p>
          </Banner>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Anthropic API Key</Text>
        <Text as="p" variant="bodyMd">
          Your API key is used to call Claude directly. It's stored securely and
          never shared.
        </Text>

        {hasApiKey && (
          <Badge tone="success">API key configured</Badge>
        )}

        {actionData?.success && (
          <Banner tone="success">API key saved successfully.</Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}

        <TextField
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          type="password"
          autoComplete="off"
          placeholder="sk-ant-..."
          helpText="Get your key from console.anthropic.com"
        />
        <Button
          variant="primary"
          loading={navigation.state === "submitting"}
          onClick={() => {
            const formData = new FormData();
            formData.set("apiKey", apiKey);
            submit(formData, { method: "post" });
          }}
        >
          {hasApiKey ? "Update API Key" : "Save API Key"}
        </Button>
      </BlockStack>
    </Card>
  );
}
