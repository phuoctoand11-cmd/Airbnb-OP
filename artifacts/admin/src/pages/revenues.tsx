import { MoneyTablePage } from "@/components/finance/MoneyTable";

export default function Revenues() {
  return (
    <MoneyTablePage
      table="revenues"
      title="Revenues"
      dateColumn="received_at"
      defaultCategory="booking_revenue"
      showVendor={false}
    />
  );
}
