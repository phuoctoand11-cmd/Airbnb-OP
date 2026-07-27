import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n";

export type Currency = "VND" | "USD";

export const VND_PER_USD = 25000;

const STORAGE_KEY = "currencyPreference";

function getStoredCurrency(): Currency {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "VND" || v === "USD") return v as Currency;
  } catch {}
  return "VND";
}

export function formatMoney(
  valueVND: number | null | undefined,
  currency: Currency
): string {
  if (valueVND === null || valueVND === undefined) return "—";
  if (currency === "USD") {
    const usd = valueVND / VND_PER_USD;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usd);
  }
  // The dong has no subunit in practice, so ".00" is both wrong and three
  // characters that push long totals onto a second line.
  return (
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(valueVND) +
    " ₫"
  );
}

/**
 * Short form for stat tiles, where the full figure overflows on narrow screens.
 * 237,833,834 ₫ becomes "237,8 Tr ₫" (vi) or "$9.5K" (USD). Always pair with a
 * `title` carrying the exact value from `formatMoney`.
 */
export function formatMoneyCompact(
  valueVND: number | null | undefined,
  currency: Currency,
  locale: string
): string {
  if (valueVND === null || valueVND === undefined) return "—";
  if (currency === "USD") {
    const usd = valueVND / VND_PER_USD;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(usd);
  }
  // Below a million the plain figure is already short enough, and a compact
  // form there ("850 N") reads worse than the number itself.
  if (Math.abs(valueVND) < 1_000_000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(valueVND) + " ₫";
  }
  return (
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(valueVND) + " ₫"
  );
}

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  fmt: (valueVND: number | null | undefined) => string;
  /** Short form for stat tiles. Pair with `title={fmt(v)}`. */
  fmtCompact: (valueVND: number | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "VND",
  setCurrency: () => {},
  fmt: (v) => formatMoney(v, "VND"),
  fmtCompact: (v) => formatMoneyCompact(v, "VND", "vi-VN"),
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [currency, setCurrencyState] = useState<Currency>(getStoredCurrency);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {}
  }, []);

  const fmt = useCallback(
    (v: number | null | undefined) => formatMoney(v, currency),
    [currency]
  );

  const fmtCompact = useCallback(
    (v: number | null | undefined) =>
      formatMoneyCompact(v, currency, lang === "vi" ? "vi-VN" : "en-US"),
    [currency, lang]
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt, fmtCompact }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
