import { MoneyTablePage } from "@/components/finance/MoneyTable";

export default function Expenses() {
  return (
    <MoneyTablePage
      table="expenses"
      title="Expenses"
      dateColumn="spent_at"
      defaultCategory="cleaning"
      showVendor
    />
  );
}
