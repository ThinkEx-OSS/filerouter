import { Highlight, themes } from "prism-react-renderer"

import { cn } from "@/lib/utils"

const codeThemes = [
  { className: "dark:hidden", name: "light", theme: themes.vsLight },
  { className: "hidden dark:block", name: "dark", theme: themes.vsDark },
] as const

export function SyntaxHighlight({
  className,
  code,
  id,
}: {
  className?: string
  code: string
  id: string
}) {
  return codeThemes.map(({ className: themeClassName, name, theme }) => (
    <Highlight code={code} key={name} language="tsx" theme={theme}>
      {({
        className: syntaxClassName,
        getLineProps,
        getTokenProps,
        style,
        tokens,
      }) => (
        <pre
          className={cn(syntaxClassName, themeClassName, className)}
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
