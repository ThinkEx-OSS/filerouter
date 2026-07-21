import { ArrowsSplit, FileText } from "@phosphor-icons/react"
import { Highlight, themes } from "prism-react-renderer"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const examples = {
  parse: `import { FileRouterClient } from "@file_router/sdk"

const client = new FileRouterClient()

const result = await client.parse(file, {
  provider: "llamaparse",
  outputs: ["markdown", "tables"],
})`,
  compare: `import { FileRouterClient } from "@file_router/sdk"

const client = new FileRouterClient()

const results = await client.compare(file, {
  providers: ["llamaparse", "mistral-ocr", "datalab"],
  outputs: ["markdown"],
})`,
} as const

const exampleTabs = [
  { icon: FileText, id: "parse", label: "Parse" },
  { icon: ArrowsSplit, id: "compare", label: "Compare" },
] as const

const codeThemes = [
  { className: "dark:hidden", name: "light", theme: themes.vsLight },
  { className: "hidden dark:block", name: "dark", theme: themes.vsDark },
] as const

export function SdkExample() {
  return (
    <Tabs
      className="gap-0 overflow-hidden rounded-none border border-border bg-card text-left"
      defaultValue="parse"
    >
      <TabsList
        className="grid w-full grid-cols-2 border-b border-border"
        variant="panel"
      >
        {exampleTabs.map(({ icon: Icon, id, label }) => (
          <TabsTrigger
            className="h-14 not-first:border-l not-first:border-border"
            key={id}
            value={id}
          >
            <Icon className="size-4 text-primary" weight="regular" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {Object.entries(examples).map(([id, example]) => (
        <TabsContent className="min-w-0" key={id} value={id}>
          <SyntaxHighlight code={example} id={id} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function SyntaxHighlight({ code, id }: { code: string; id: string }) {
  return codeThemes.map(({ className, name, theme }) => (
    <Highlight code={code} key={name} language="tsx" theme={theme}>
      {({
        className: syntaxClassName,
        getLineProps,
        getTokenProps,
        style,
        tokens,
      }) => (
        <pre
          className={`${syntaxClassName} ${className} overflow-x-auto p-5 font-mono text-sm leading-7 md:p-7`}
          style={{ ...style, backgroundColor: "transparent" }}
        >
          <code>
            {tokens.map((line, lineIndex) => (
              <span
                key={`${id}-${name}-line-${lineIndex}`}
                {...getLineProps({ line })}
                className="block"
              >
                {line.map((token, tokenIndex) => (
                  <span
                    key={`${id}-${name}-token-${lineIndex}-${tokenIndex}`}
                    {...getTokenProps({ token })}
                  />
                ))}
                {"\n"}
              </span>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  ))
}
