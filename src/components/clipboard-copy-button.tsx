import { Check, Copy } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

type ClipboardCopyButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "aria-label" | "asChild" | "children" | "onClick" | "type"
> & {
  label: string
  value: string
}

export function ClipboardCopyButton({
  label,
  value,
  ...props
}: ClipboardCopyButtonProps) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <Button
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={() => void copy(value)}
      type="button"
      {...props}
    >
      {copied ? <Check weight="bold" /> : <Copy weight="bold" />}
    </Button>
  )
}
