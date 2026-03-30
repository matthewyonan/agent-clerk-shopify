import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  RadioButton,
  TextField,
  Banner,
  ProgressBar,
  InlineStack,
  Spinner,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";
import { scanStore } from "~/lib/scanner.server";
import { registerInstall } from "~/lib/backend.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let install = await prisma.install.findUnique({
    where: { shop },
    include: { config: true },
  });

  return json({
    shop,
    install,
    currentStep: install?.onboardingStep ?? 1,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const step = formData.get("step") as string;
  const action = formData.get("_action") as string;

  let install = await prisma.install.findUnique({
    where: { shop },
    include: { config: true },
  });

  // Step 1: Choose tier and register
  if (step === "1") {
    const tier = formData.get("tier") as string;

    if (!install) {
      // Register with backend
      const { installSecret } = await registerInstall(shop, shop);

      install = await prisma.install.create({
        data: {
          shop,
          shopDomain: shop,
          installSecret,
          tier: tier || "byok",
          onboardingStep: 2,
          config: {
            create: {},
          },
        },
        include: { config: true },
      });
    } else {
      await prisma.install.update({
        where: { shop },
        data: { tier: tier || "byok", onboardingStep: 2 },
      });
    }

    return json({ success: true, step: 2 });
  }

  // Step 2: Scan store
  if (step === "2") {
    if (!install) return json({ error: "Install not found" }, { status: 400 });

    const scanResult = await scanStore(admin);

    await prisma.agentConfig.update({
      where: { installId: install.id },
      data: {
        scanCache: scanResult as any,
        businessName: scanResult.shop.name,
        businessDesc: scanResult.shop.description,
        refundPolicy: scanResult.policies.refundPolicy || "",
        deliveryPolicy: scanResult.policies.shippingPolicy || "",
      },
    });

    await prisma.install.update({
      where: { shop },
      data: { onboardingStep: 3, lastScanDate: new Date() },
    });

    return json({
      success: true,
      step: 3,
      scanResult: {
        productCount: scanResult.products.length,
        pageCount: scanResult.pages.length,
        articleCount: scanResult.articles.length,
        hasPolicies: !!(
          scanResult.policies.refundPolicy ||
          scanResult.policies.shippingPolicy
        ),
      },
    });
  }

  // Step 3: Business info
  if (step === "3") {
    if (!install) return json({ error: "Install not found" }, { status: 400 });

    await prisma.agentConfig.update({
      where: { installId: install.id },
      data: {
        businessName: (formData.get("businessName") as string) || "",
        businessDesc: (formData.get("businessDesc") as string) || "",
        agentName: (formData.get("agentName") as string) || "AgentClerk",
        escalationEmail: (formData.get("escalationEmail") as string) || "",
      },
    });

    await prisma.install.update({
      where: { shop },
      data: { onboardingStep: 4 },
    });

    return json({ success: true, step: 4 });
  }

  // Step 4: API key (BYOK) or skip (TurnKey)
  if (step === "4") {
    if (!install) return json({ error: "Install not found" }, { status: 400 });

    if (install.tier === "byok") {
      const apiKey = formData.get("apiKey") as string;
      if (!apiKey) return json({ error: "API key required for BYOK tier" });

      await prisma.install.update({
        where: { shop },
        data: { apiKey, onboardingStep: 5 },
      });
    } else {
      await prisma.install.update({
        where: { shop },
        data: { onboardingStep: 5 },
      });
    }

    return json({ success: true, step: 5 });
  }

  // Step 5: Placement settings
  if (step === "5") {
    if (!install) return json({ error: "Install not found" }, { status: 400 });

    await prisma.agentConfig.update({
      where: { installId: install.id },
      data: {
        placementWidget: formData.get("placementWidget") === "true",
        placementProduct: formData.get("placementProduct") === "true",
        position: (formData.get("position") as string) || "bottom-right",
        buttonLabel: (formData.get("buttonLabel") as string) || "Get Help",
      },
    });

    await prisma.install.update({
      where: { shop },
      data: { onboardingStep: 6 },
    });

    return json({ success: true, step: 6 });
  }

  // Step 6: Go live
  if (step === "6") {
    if (!install) return json({ error: "Install not found" }, { status: 400 });

    await prisma.install.update({
      where: { shop },
      data: { pluginStatus: "active", onboardingStep: 6 },
    });

    return json({ success: true, step: 7, goLive: true });
  }

  return json({ error: "Invalid step" }, { status: 400 });
}

export default function Setup() {
  const { shop, install, currentStep } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [step, setStep] = useState(actionData?.step || currentStep);
  const [tier, setTier] = useState(install?.tier || "byok");
  const [businessName, setBusinessName] = useState(install?.config?.businessName || "");
  const [businessDesc, setBusinessDesc] = useState(install?.config?.businessDesc || "");
  const [agentName, setAgentName] = useState(install?.config?.agentName || "AgentClerk");
  const [escalationEmail, setEscalationEmail] = useState(install?.config?.escalationEmail || "");
  const [apiKey, setApiKey] = useState("");
  const [position, setPosition] = useState(install?.config?.position || "bottom-right");
  const [buttonLabel, setButtonLabel] = useState(install?.config?.buttonLabel || "Get Help");

  const progress = Math.round(((step - 1) / 6) * 100);

  const handleSubmitStep = useCallback(
    (stepNum: number, data: Record<string, string>) => {
      const formData = new FormData();
      formData.set("step", String(stepNum));
      Object.entries(data).forEach(([key, value]) => {
        formData.set(key, value);
      });
      submit(formData, { method: "post" });
    },
    [submit],
  );

  if (actionData?.goLive) {
    return (
      <Page title="Setup Complete!">
        <Layout>
          <Layout.Section>
            <Banner title="Your AI agent is live!" tone="success">
              <p>
                AgentClerk is now active on your store and ready to help buyers.
              </p>
            </Banner>
            <Box padding="400">
              <Button variant="primary" url="/app">
                Go to Dashboard
              </Button>
            </Box>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Set Up AgentClerk" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">
              Step {step} of 6
            </Text>
            <ProgressBar progress={progress} size="small" />
          </BlockStack>
        </Card>

        {/* Step 1: Choose Tier */}
        {step === 1 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Choose Your Plan
              </Text>
              <RadioButton
                label="Bring Your Own Key (BYOK)"
                helpText="Use your own Anthropic API key. Pay only for what you use."
                checked={tier === "byok"}
                onChange={() => setTier("byok")}
              />
              <RadioButton
                label="TurnKey"
                helpText="We handle the AI. Requires an AgentClerk license."
                checked={tier === "turnkey"}
                onChange={() => setTier("turnkey")}
              />
              <Button
                variant="primary"
                loading={isSubmitting}
                onClick={() => handleSubmitStep(1, { tier })}
              >
                Continue
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Step 2: Scan Store */}
        {step === 2 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Scan Your Store
              </Text>
              <Text as="p" variant="bodyMd">
                We'll scan your products, pages, and policies to teach the AI
                agent about your store.
              </Text>
              {actionData?.scanResult && (
                <Banner title="Scan Complete" tone="success">
                  <p>
                    Found {actionData.scanResult.productCount} products,{" "}
                    {actionData.scanResult.pageCount} pages, and{" "}
                    {actionData.scanResult.articleCount} articles.
                  </p>
                </Banner>
              )}
              <Button
                variant="primary"
                loading={isSubmitting}
                onClick={() => handleSubmitStep(2, {})}
              >
                {isSubmitting ? "Scanning..." : "Scan Store"}
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Step 3: Business Info */}
        {step === 3 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Business & Agent Info
              </Text>
              <TextField
                label="Business Name"
                value={businessName}
                onChange={setBusinessName}
                autoComplete="off"
              />
              <TextField
                label="Business Description"
                value={businessDesc}
                onChange={setBusinessDesc}
                multiline={3}
                autoComplete="off"
              />
              <TextField
                label="Agent Name"
                value={agentName}
                onChange={setAgentName}
                autoComplete="off"
                helpText="The name your AI agent will introduce itself as"
              />
              <TextField
                label="Escalation Email"
                value={escalationEmail}
                onChange={setEscalationEmail}
                type="email"
                autoComplete="off"
                helpText="Email for human escalation when AI can't resolve an issue"
              />
              <Button
                variant="primary"
                loading={isSubmitting}
                onClick={() =>
                  handleSubmitStep(3, {
                    businessName,
                    businessDesc,
                    agentName,
                    escalationEmail,
                  })
                }
              >
                Continue
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Step 4: API Key */}
        {step === 4 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                {tier === "byok" ? "Anthropic API Key" : "License Activation"}
              </Text>
              {tier === "byok" ? (
                <>
                  <TextField
                    label="API Key"
                    value={apiKey}
                    onChange={setApiKey}
                    type="password"
                    autoComplete="off"
                    helpText="Your Anthropic API key (starts with sk-ant-)"
                  />
                  <Button
                    variant="primary"
                    loading={isSubmitting}
                    onClick={() => handleSubmitStep(4, { apiKey })}
                  >
                    Save & Continue
                  </Button>
                </>
              ) : (
                <>
                  <Text as="p" variant="bodyMd">
                    TurnKey mode uses the AgentClerk backend. You can manage
                    your license in the Sales tab.
                  </Text>
                  <Button
                    variant="primary"
                    loading={isSubmitting}
                    onClick={() => handleSubmitStep(4, {})}
                  >
                    Continue
                  </Button>
                </>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Step 5: Placement */}
        {step === 5 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Widget Placement
              </Text>
              <RadioButton
                label="Bottom Right"
                checked={position === "bottom-right"}
                onChange={() => setPosition("bottom-right")}
              />
              <RadioButton
                label="Bottom Left"
                checked={position === "bottom-left"}
                onChange={() => setPosition("bottom-left")}
              />
              <TextField
                label="Button Label"
                value={buttonLabel}
                onChange={setButtonLabel}
                autoComplete="off"
              />
              <Button
                variant="primary"
                loading={isSubmitting}
                onClick={() =>
                  handleSubmitStep(5, {
                    placementWidget: "true",
                    placementProduct: "true",
                    position,
                    buttonLabel,
                  })
                }
              >
                Continue
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Step 6: Go Live */}
        {step === 6 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Ready to Go Live
              </Text>
              <Text as="p" variant="bodyMd">
                Your AI agent is configured and ready. Enable the chat widget in
                your theme settings, then activate your agent.
              </Text>
              <Banner title="Theme App Extension" tone="info">
                <p>
                  Go to Online Store → Themes → Customize → App Embeds and
                  enable "AgentClerk Chat Widget".
                </p>
              </Banner>
              <Button
                variant="primary"
                loading={isSubmitting}
                onClick={() => handleSubmitStep(6, {})}
              >
                Activate Agent
              </Button>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
