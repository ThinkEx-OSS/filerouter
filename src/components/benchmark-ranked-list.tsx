import type { BenchmarkEntry, BenchmarkMetric } from "@/lib/benchmark-data"
import { resolveSupportedBenchmarkProvider } from "@/lib/provider-display"

export function BenchmarkRankedList({
  entries,
  metric,
}: {
  entries: ReadonlyArray<BenchmarkEntry>
  metric: BenchmarkMetric
}) {
  const ranked = [...entries]
    .filter((entry) => typeof entry.scores[metric.id] === "number")
    .sort(
      (left, right) =>
        (right.scores[metric.id] ?? 0) - (left.scores[metric.id] ?? 0)
    )
  const leaders = ranked.slice(0, 6)
  const leaderNames = new Set(leaders.map((entry) => entry.name))
  const featured = ranked.filter(
    (entry) => entry.featured && !leaderNames.has(entry.name)
  )
  const visible = [...leaders, ...featured]

  return (
    <ol className="mt-4 divide-y divide-border">
      {visible.map((entry, index) => {
        const score = entry.scores[metric.id]
        if (typeof score !== "number") return null
        const width = Math.max(
          score === 0 ? 0 : 2,
          Math.min(100, (score / metric.maximum) * 100)
        )
        const supported = resolveSupportedBenchmarkProvider(entry.name)

        return (
          <li
            className="benchmark-row grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 md:grid-cols-[1.75rem_15rem_minmax(8rem,1fr)_5.25rem]"
            key={entry.name}
          >
            <span className="row-span-2 self-start pt-0.5 font-mono text-[11px] text-muted-foreground md:row-span-1 md:self-center md:pt-0">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden={supported ? undefined : true}
                  className="relative size-4 shrink-0 overflow-hidden"
                  title={
                    supported
                      ? `Available via FileRouter · ${supported.label}`
                      : undefined
                  }
                >
                  {supported ? (
                    <>
                      <img
                        alt=""
                        className="absolute top-0 left-0 h-full w-auto max-w-none dark:hidden"
                        src={supported.logo}
                      />
                      <img
                        alt=""
                        className="absolute top-0 left-0 hidden h-full w-auto max-w-none dark:block"
                        src={supported.darkLogo}
                      />
                    </>
                  ) : null}
                </span>
                <span
                  className="truncate text-sm font-medium"
                  title={entry.name}
                >
                  {entry.name}
                </span>
              </div>
              <p className="mt-0.5 truncate pl-6 font-mono text-[10px] text-muted-foreground">
                {entry.secondary ?? entry.category}
              </p>
            </div>
            <div className="col-start-2 col-end-4 row-start-2 h-2 overflow-hidden bg-muted md:col-start-3 md:col-end-4 md:row-start-1">
              <div
                className="benchmark-bar-fill h-full origin-left"
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="col-start-3 row-start-1 text-right md:col-start-4">
              <span className="block font-mono text-sm tabular-nums">
                {score.toFixed(metric.decimals)}
                {metric.suffix}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
