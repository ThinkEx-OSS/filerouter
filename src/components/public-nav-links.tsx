const linkClassName =
  "text-sm font-normal text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"

const placeholderLinks = ["Benchmarks", "Pricing", "Blog"] as const

export function PublicNavLinks() {
  return (
    <div className="flex items-center gap-6">
      <a className={linkClassName} href="https://docs.filerouter.dev">
        Docs
      </a>
      {placeholderLinks.map((label) => (
        <span
          aria-disabled="true"
          className={`${linkClassName} cursor-default`}
          key={label}
          title={`${label} coming soon`}
        >
          {label}
        </span>
      ))}
    </div>
  )
}
