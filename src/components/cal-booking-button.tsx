import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const CAL_LINK = "thinkex-team-vuzyak/15min"
const CAL_NAMESPACE = "15min"
const CAL_CONFIG = {
  layout: "month_view" as const,
  useSlotsViewOnSmallScreen: "true",
}

let calendarInitialization:
  | ReturnType<(typeof import("@calcom/embed-react"))["getCalApi"]>
  | undefined

function initializeCalendar() {
  calendarInitialization ??= import("@calcom/embed-react").then(
    ({ getCalApi }) => getCalApi({ namespace: CAL_NAMESPACE })
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
  const [isOpening, setIsOpening] = useState(false)

  async function openCalendar() {
    setIsOpening(true)
    try {
      const cal = await initializeCalendar()
      cal("ui", {
        cssVarsPerTheme: {
          light: { "cal-brand": "#00BDF7" },
          dark: { "cal-brand": "#00BDF7" },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      })
      cal("modal", {
        calLink: CAL_LINK,
        config: CAL_CONFIG,
      })
    } finally {
      setIsOpening(false)
    }
  }

  return (
    <Button
      className={cn("font-normal", className)}
      disabled={isOpening}
      onClick={() => void openCalendar()}
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  )
}
