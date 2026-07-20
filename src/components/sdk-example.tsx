import { useState } from "react"

const examples = {
  compare: `import { FileRouterClient } from "@file_router/sdk"

const client = new FileRouterClient()

const results = await client.compare(file, {
  providers: ["llamaparse", "mistral-ocr", "datalab"],
  outputs: ["markdown"],
})`,
  parse: `import { FileRouterClient } from "@file_router/sdk"

const client = new FileRouterClient()

const result = await client.parse(file, {
  provider: "llamaparse",
  outputs: ["markdown", "tables"],
})`,
} as const

type ExampleId = keyof typeof examples

export function SdkExample() {
  const [activeExample, setActiveExample] = useState<ExampleId>("parse")

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-left">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        {Object.keys(examples).map((example) => {
          const id = example as ExampleId
          return (
            <button
              aria-pressed={activeExample === id}
              className="rounded-sm px-3 py-1.5 text-sm font-normal text-muted-foreground capitalize transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
              key={id}
              onClick={() => setActiveExample(id)}
              type="button"
            >
              {id}
            </button>
          )
        })}
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-sm leading-7 md:p-7">
        <code>{examples[activeExample]}</code>
      </pre>
    </div>
  )
}
