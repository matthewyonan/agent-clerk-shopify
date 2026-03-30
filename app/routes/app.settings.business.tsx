import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { Card, BlockStack, TextField, Button, Banner } from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const install = await prisma.install.findUnique({
    where: { shop: session.shop },
    include: { config: true },
  });

  return json({
    config: install?.config || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const install = await prisma.install.findUnique({
    where: { shop: session.shop },
  });
  if (!install) return json({ error: "Not installed" }, { status: 400 });

  await prisma.agentConfig.upsert({
    where: { installId: install.id },
    update: {
      agentName: (formData.get("agentName") as string) || "AgentClerk",
      businessName: (formData.get("businessName") as string) || "",
      businessDesc: (formData.get("businessDesc") as string) || "",
      supportFile: (formData.get("supportFile") as string) || "",
    },
    create: {
      installId: install.id,
      agentName: (formData.get("agentName") as string) || "AgentClerk",
      businessName: (formData.get("businessName") as string) || "",
      businessDesc: (formData.get("businessDesc") as string) || "",
      supportFile: (formData.get("supportFile") as string) || "",
    },
  });

  return json({ success: true });
}

export default function SettingsBusiness() {
  const { config } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [agentName, setAgentName] = useState(config?.agentName || "AgentClerk");
  const [businessName, setBusinessName] = useState(config?.businessName || "");
  const [businessDesc, setBusinessDesc] = useState(config?.businessDesc || "");
  const [supportFile, setSupportFile] = useState(config?.supportFile || "");

  return (
    <Card>
      <BlockStack gap="400">
        {navigation.state === "idle" && navigation.formData && (
          <Banner tone="success">Settings saved.</Banner>
        )}
        <TextField
          label="Agent Name"
          value={agentName}
          onChange={setAgentName}
          autoComplete="off"
          helpText="The name your AI agent uses when chatting"
        />
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
          multiline={4}
          autoComplete="off"
          helpText="Describe what your business does — this helps the AI agent"
        />
        <TextField
          label="Additional Support Information"
          value={supportFile}
          onChange={setSupportFile}
          multiline={6}
          autoComplete="off"
          helpText="Extra info for the agent: FAQs, policies, special instructions"
        />
        <Button
          variant="primary"
          loading={navigation.state === "submitting"}
          onClick={() => {
            const formData = new FormData();
            formData.set("agentName", agentName);
            formData.set("businessName", businessName);
            formData.set("businessDesc", businessDesc);
            formData.set("supportFile", supportFile);
            submit(formData, { method: "post" });
          }}
        >
          Save
        </Button>
      </BlockStack>
    </Card>
  );
}
