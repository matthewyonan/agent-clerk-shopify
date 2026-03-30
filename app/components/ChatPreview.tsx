import { useState, useCallback, useRef, useEffect } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Text,
  Box,
  Spinner,
} from "@shopify/polaris";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPreviewProps {
  shopDomain: string;
  testMode?: boolean;
}

export function ChatPreview({ shopDomain, testMode = true }: ChatPreviewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `test-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(
        `/apps/agentclerk/chat?shop=${encodeURIComponent(shopDomain)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            sessionId,
            testMode,
          }),
        },
      );

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "No response" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Could not reach the chat server." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, shopDomain, sessionId, testMode]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Chat Preview {testMode ? "(Test Mode)" : ""}
        </Text>

        <Box
          minHeight="300px"
          maxWidth="100%"
          padding="300"
          background="bg-surface-secondary"
          borderRadius="200"
          overflowY="auto"
        >
          <BlockStack gap="300">
            {messages.length === 0 && (
              <Text as="p" tone="subdued" alignment="center">
                Send a message to test your AI agent
              </Text>
            )}
            {messages.map((msg, i) => (
              <Box
                key={i}
                padding="200"
                background={
                  msg.role === "user" ? "bg-surface-info" : "bg-surface"
                }
                borderRadius="200"
              >
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    {msg.role === "user" ? "You" : "Agent"}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {msg.content}
                  </Text>
                </BlockStack>
              </Box>
            ))}
            {loading && (
              <Box padding="200">
                <InlineStack gap="200" align="center">
                  <Spinner size="small" />
                  <Text as="span" tone="subdued">
                    Thinking...
                  </Text>
                </InlineStack>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </BlockStack>
        </Box>

        <InlineStack gap="200" blockAlign="end">
          <div style={{ flex: 1 }}>
            <TextField
              label=""
              labelHidden
              value={input}
              onChange={setInput}
              autoComplete="off"
              placeholder="Type a message..."
              onKeyDown={(e) => {
                if (e === "Enter") sendMessage();
              }}
            />
          </div>
          <Button variant="primary" onClick={sendMessage} loading={loading}>
            Send
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
