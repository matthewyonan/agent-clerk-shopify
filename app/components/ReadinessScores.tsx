import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  ProgressBar,
  Badge,
  Icon,
} from "@shopify/polaris";
import { CheckCircleIcon, AlertCircleIcon } from "@shopify/polaris-icons";

interface ReadinessItem {
  label: string;
  ready: boolean;
  detail?: string;
}

interface ReadinessScoresProps {
  items: ReadinessItem[];
}

export function ReadinessScores({ items }: ReadinessScoresProps) {
  const readyCount = items.filter((i) => i.ready).length;
  const progress = Math.round((readyCount / items.length) * 100);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingMd">
            Readiness Score
          </Text>
          <Badge tone={progress === 100 ? "success" : "attention"}>
            {readyCount}/{items.length}
          </Badge>
        </InlineStack>

        <ProgressBar progress={progress} size="small" tone={progress === 100 ? "success" : "highlight"} />

        <BlockStack gap="200">
          {items.map((item, i) => (
            <InlineStack key={i} gap="200" align="start" blockAlign="center">
              <Icon
                source={item.ready ? CheckCircleIcon : AlertCircleIcon}
                tone={item.ready ? "success" : "caution"}
              />
              <BlockStack gap="0">
                <Text as="span" variant="bodyMd">
                  {item.label}
                </Text>
                {item.detail && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    {item.detail}
                  </Text>
                )}
              </BlockStack>
            </InlineStack>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
