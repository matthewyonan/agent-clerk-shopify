import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Card,
  BlockStack,
  TextField,
  Button,
  RadioButton,
  Checkbox,
  Text,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const install = await prisma.install.findUnique({
    where: { shop: session.shop },
    include: { config: true },
  });

  return json({ config: install?.config || null });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const install = await prisma.install.findUnique({
    where: { shop: session.shop },
  });
  if (!install) return json({ error: "Not installed" }, { status: 400 });

  await prisma.agentConfig.update({
    where: { installId: install.id },
    data: {
      placementWidget: formData.get("placementWidget") === "true",
      placementProduct: formData.get("placementProduct") === "true",
      placementClerk: formData.get("placementClerk") === "true",
      position: (formData.get("position") as string) || "bottom-right",
      buttonLabel: (formData.get("buttonLabel") as string) || "Get Help",
    },
  });

  return json({ success: true });
}

export default function SettingsPlacement() {
  const { config } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [placementWidget, setPlacementWidget] = useState(config?.placementWidget ?? true);
  const [placementProduct, setPlacementProduct] = useState(config?.placementProduct ?? true);
  const [placementClerk, setPlacementClerk] = useState(config?.placementClerk ?? true);
  const [position, setPosition] = useState(config?.position || "bottom-right");
  const [buttonLabel, setButtonLabel] = useState(config?.buttonLabel || "Get Help");

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Widget Placement</Text>

        <Checkbox
          label="Show floating chat widget"
          checked={placementWidget}
          onChange={setPlacementWidget}
          helpText="Display the chat bubble on all pages"
        />
        <Checkbox
          label="Show on product pages"
          checked={placementProduct}
          onChange={setPlacementProduct}
          helpText="Display contextual help on product pages"
        />
        <Checkbox
          label="Show AgentClerk branding"
          checked={placementClerk}
          onChange={setPlacementClerk}
        />

        <Text as="h3" variant="headingSm">Position</Text>
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

        <Banner tone="info">
          <p>
            Remember to enable the "AgentClerk Chat Widget" app embed in your
            theme settings: Online Store → Themes → Customize → App Embeds.
          </p>
        </Banner>

        <Button
          variant="primary"
          loading={navigation.state === "submitting"}
          onClick={() => {
            const formData = new FormData();
            formData.set("placementWidget", String(placementWidget));
            formData.set("placementProduct", String(placementProduct));
            formData.set("placementClerk", String(placementClerk));
            formData.set("position", position);
            formData.set("buttonLabel", buttonLabel);
            submit(formData, { method: "post" });
          }}
        >
          Save
        </Button>
      </BlockStack>
    </Card>
  );
}
