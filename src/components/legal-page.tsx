import { PublicPageShell } from "@/components/public-page-shell"

interface LegalSection {
  body?: string
  items?: Array<string>
  title: string
}

export interface LegalDocument {
  description: string
  lastUpdated: string
  sections: Array<LegalSection>
  title: string
}

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <PublicPageShell>
      <article className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
        <p className="text-sm text-muted-foreground">
          Last updated {document.lastUpdated}
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight text-balance sm:text-5xl">
          {document.title}
        </h1>
        <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
          {document.description}
        </p>

        <div className="mt-12 space-y-10">
          {document.sections.map((section) => (
            <section className="space-y-3" key={section.title}>
              <h2 className="text-xl font-medium tracking-tight">
                {section.title}
              </h2>
              {section.body ? (
                <p className="text-sm leading-7 text-muted-foreground">
                  {section.body}
                </p>
              ) : null}
              {section.items ? (
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>
    </PublicPageShell>
  )
}
