import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

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
  return (
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valueVND) + " ₫"
  );
}

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  fmt: (valueVND: number | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "VND",
  setCurrency: () => {},
  fmt: (v) => formatMoney(v, "VND"),
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
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

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
