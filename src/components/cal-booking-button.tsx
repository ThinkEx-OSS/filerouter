import { useEffect, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const CAL_LINK = "thinkex-team-vuzyak/15min"
const CAL_NAMESPACE = "15min"

let calendarInitialization: Promise<void> | undefined

function initializeCalendar() {
  calendarInitialization ??= import("@calcom/embed-react").then(
    async ({ getCalApi }) => {
      const cal = await getCalApi({ namespace: CAL_NAMESPACE })
      cal("ui", {
        cssVarsPerTheme: {
          light: { "cal-brand": "#00BDF7" },
          dark: { "cal-brand": "#00BDF7" },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      })
    }
  )

  return calendarInitialization
}

type CalBookingButtonProps = {
  children: ReactNode
  className?: string
}

export function CalBookingButton({
  children,
  className,
}: CalBookingButtonProps) {
  useEffect(() => {
    void initializeCalendar()
  }, [])

  return (
    <Button
      className={cn("font-normal", className)}
      data-cal-config='{"layout":"month_view","useSlotsViewOnSmallScreen":"true"}'
      data-cal-link={CAL_LINK}
      data-cal-namespace={CAL_NAMESPACE}
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  )
}
