import { useEffect, useState } from "react"

type BlogHeading = {
  id: string
  text: string
  level: number
}

export function BlogTableOfContents({ headings }: { headings: BlogHeading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? "")

  useEffect(() => {
    const headingElements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element))

    if (headingElements.length === 0) return

    const visibleHeadings = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleHeadings.set(entry.target.id, entry.boundingClientRect.top)
          } else {
            visibleHeadings.delete(entry.target.id)
          }
        }

        const nextActiveId =
          Array.from(visibleHeadings.entries()).sort(
            ([, a], [, b]) => a - b
          )[0]?.[0] ??
          headingElements
            .filter((element) => element.getBoundingClientRect().top < 120)
            .at(-1)?.id ??
          headingElements[0]?.id

        if (nextActiveId) setActiveId(nextActiveId)
      },
      {
        rootMargin: "-96px 0px -65% 0px",
        threshold: [0, 1],
      }
    )

    for (const element of headingElements) observer.observe(element)
    return () => observer.disconnect()
  }, [headings])

  return (
    <div className="sticky top-20 border-l border-border pl-5">
      <p className="text-xs font-medium text-muted-foreground">On this page</p>
      <nav aria-label="Post sections" className="mt-3 grid gap-2 text-sm">
        {headings.map((heading) => {
          const isActive = heading.id === activeId

          return (
            <a
              aria-current={isActive ? "true" : undefined}
              className={
                isActive
                  ? "text-foreground underline underline-offset-4"
                  : "text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              }
              href={`#${heading.id}`}
              key={heading.id}
            >
              {heading.text}
            </a>
          )
        })}
      </nav>
    </div>
  )
}
