import { CalendarRange } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useI18n } from "@/i18n";

export default function AvailabilityCalendar() {
  const { t } = useI18n();
  return (
    <AppLayout title={t.nav.availabilityCalendar}>
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center text-muted-foreground">
        <CalendarRange className="h-12 w-12 opacity-30" />
        <p className="text-lg font-medium">{t.nav.availabilityCalendar}</p>
        <p className="text-sm">{t.common.comingSoon}</p>
      </div>
    </AppLayout>
  );
}
