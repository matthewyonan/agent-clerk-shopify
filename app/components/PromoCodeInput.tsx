import { useState } from "react";
import { InlineStack, TextField, Button } from "@shopify/polaris";

interface PromoCodeInputProps {
  onSubmit: (promoCode: string) => void;
  loading?: boolean;
}

export function PromoCodeInput({ onSubmit, loading }: PromoCodeInputProps) {
  const [promoCode, setPromoCode] = useState("");
  const [showField, setShowField] = useState(false);

  if (!showField) {
    return (
      <InlineStack gap="200">
        <Button variant="primary" onClick={() => onSubmit("")} loading={loading}>
          Get License
        </Button>
        <Button variant="plain" onClick={() => setShowField(true)}>
          Have a promo code?
        </Button>
      </InlineStack>
    );
  }

  return (
    <InlineStack gap="200" blockAlign="end">
      <div style={{ flex: 1 }}>
        <TextField
          label="Promo Code"
          value={promoCode}
          onChange={setPromoCode}
          autoComplete="off"
          placeholder="Enter promo code"
        />
      </div>
      <Button
        variant="primary"
        onClick={() => onSubmit(promoCode)}
        loading={loading}
      >
        Apply & Checkout
      </Button>
    </InlineStack>
  );
}
