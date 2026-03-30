import { BlockStack, Text, ProgressBar, InlineStack, Button } from "@shopify/polaris";

interface OnboardingWizardProps {
  currentStep: number;
  totalSteps: number;
  onNext?: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}

const STEP_LABELS = [
  "Choose Plan",
  "Scan Store",
  "Business Info",
  "API Key",
  "Placement",
  "Go Live",
];

export function OnboardingWizard({
  currentStep,
  totalSteps,
  onNext,
  onBack,
  children,
}: OnboardingWizardProps) {
  const progress = Math.round(((currentStep - 1) / totalSteps) * 100);

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between">
        <Text as="p" variant="bodySm" tone="subdued">
          Step {currentStep} of {totalSteps}: {STEP_LABELS[currentStep - 1] || ""}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {progress}% complete
        </Text>
      </InlineStack>

      <ProgressBar progress={progress} size="small" />

      {children}

      <InlineStack align="space-between">
        {currentStep > 1 ? (
          <Button onClick={onBack}>Back</Button>
        ) : (
          <div />
        )}
        {onNext && (
          <Button variant="primary" onClick={onNext}>
            {currentStep === totalSteps ? "Finish" : "Next"}
          </Button>
        )}
      </InlineStack>
    </BlockStack>
  );
}
