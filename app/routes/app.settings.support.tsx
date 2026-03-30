import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  Banner,
  Tag,
  InlineStack,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
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

  const topics = (formData.get("escalationTopics") as string)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await prisma.agentConfig.update({
    where: { installId: install.id },
    data: {
      escalationEmail: (formData.get("escalationEmail") as string) || "",
      escalationMessage: (formData.get("escalationMessage") as string) || "",
      escalationMethod: (formData.get("escalationMethod") as string) || "both",
      escalationTopics: topics,
    },
  });

  return json({ success: true });
}

export default function SettingsSupport() {
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [email, setEmail] = useState(config?.escalationEmail || "");
  const [message, setMessage] = useState(
    config?.escalationMessage ||
      "A support agent will follow up via email within 24 hours.",
  );
  const [topics, setTopics] = useState<string[]>(config?.escalationTopics || []);
  const [newTopic, setNewTopic] = useState("");

  const addTopic = useCallback(() => {
    if (newTopic.trim() && !topics.includes(newTopic.trim())) {
      setTopics([...topics, newTopic.trim()]);
      setNewTopic("");
    }
  }, [newTopic, topics]);

  const removeTopic = useCallback(
    (topic: string) => {
      setTopics(topics.filter((t) => t !== topic));
    },
    [topics],
  );

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Support & Escalation</Text>

        {actionData?.success && (
          <Banner tone="success">Settings saved.</Banner>
        )}

        <TextField
          label="Escalation Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="off"
          helpText="Where escalated conversations are sent"
        />
        <TextField
          label="Escalation Message"
          value={message}
          onChange={setMessage}
          multiline={2}
          autoComplete="off"
          helpText="Message shown to the buyer when escalating"
        />

        <Text as="h3" variant="headingSm">Escalation Topics</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Topics that should trigger human escalation
        </Text>
        <InlineStack gap="200" wrap>
          {topics.map((topic) => (
            <Tag key={topic} onRemove={() => removeTopic(topic)}>
              {topic}
            </Tag>
          ))}
        </InlineStack>
        <InlineStack gap="200">
          <div style={{ flex: 1 }}>
            <TextField
              label=""
              labelHidden
              value={newTopic}
              onChange={setNewTopic}
              autoComplete="off"
              placeholder="Add a topic..."
              onBlur={addTopic}
            />
          </div>
          <Button onClick={addTopic}>Add</Button>
        </InlineStack>

        <Button
          variant="primary"
          loading={navigation.state === "submitting"}
          onClick={() => {
            const formData = new FormData();
            formData.set("escalationEmail", email);
            formData.set("escalationMessage", message);
            formData.set("escalationMethod", "both");
            formData.set("escalationTopics", topics.join(","));
            submit(formData, { method: "post" });
          }}
        >
          Save
        </Button>
      </BlockStack>
    </Card>
  );
}
