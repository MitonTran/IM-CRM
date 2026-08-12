"use client";

import { useState, type InputHTMLAttributes } from "react";

type FormattedNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "inputMode" | "max" | "min" | "name" | "onChange" | "step" | "type" | "value"
> & {
  name: string;
  defaultValue?: number | string;
  maxDigits?: number;
};

export function normalizeWholeNumberInput(value: string, maxDigits = 15) {
  const digits = value.replace(/\D/g, "").slice(0, maxDigits);
  return digits.replace(/^0+(?=\d)/, "");
}

export function formatWholeNumberInput(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function FormattedNumberInput({
  name,
  defaultValue = "",
  maxDigits = 15,
  disabled,
  ...props
}: FormattedNumberInputProps) {
  const [rawValue, setRawValue] = useState(() => normalizeWholeNumberInput(String(defaultValue), maxDigits));

  return <>
    <input
      {...props}
      disabled={disabled}
      inputMode="numeric"
      type="text"
      value={formatWholeNumberInput(rawValue)}
      onChange={(event) => setRawValue(normalizeWholeNumberInput(event.currentTarget.value, maxDigits))}
    />
    <input disabled={disabled} name={name} type="hidden" value={rawValue} />
  </>;
}
