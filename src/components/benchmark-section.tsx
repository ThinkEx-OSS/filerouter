import { ArrowSquareOut } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

import {
  benchmarks,
  type BenchmarkEntry,
  type BenchmarkMetricId,
} from "@/lib/benchmark-data"
import { resolveSupportedBenchmarkProvider } from "@/lib/provider-display"
import { cn } from "@/lib/utils"

const FIRST_BENCHMARK = benchmarks[0]

export function BenchmarkSection() {
  const [benchmarkIndex, setBenchmarkIndex] = useState(0)
  const [metricId, setMetricId] = useState<BenchmarkMetricId>(
    FIRST_BENCHMARK.defaultMetric
  )
  const benchmark = benchmarks[benchmarkIndex] ?? FIRST_BENCHMARK
  const metric =
    benchmark.metrics.find((candidate) => candidate.id === metricId) ??
    benchmark.metrics[0]

  const visibleEntries = useMemo(() => {
    const entries: ReadonlyArray<BenchmarkEntry> = benchmark.entries
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

    return [...leaders, ...featured]
  }, [benchmark, metric.id])

  function selectBenchmark(index: number) {
    const nextBenchmark = benchmarks[index]
    if (!nextBenchmark) return
    setBenchmarkIndex(index)
    setMetricId(nextBenchmark.defaultMetric)
  }

  return (
    <section className="border-b border-border" id="benchmarks">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h2 className="max-w-3xl text-3xl font-medium md:text-4xl md:whitespace-nowrap">
              Different documents. Different winners.
            </h2>
          </div>
          <p className="max-w-2xl leading-7 text-muted-foreground lg:justify-self-end lg:whitespace-nowrap">
            See where each provider performs best.
          </p>
        </div>

        <div className="mt-10 border border-border">
          <div
            aria-label="Choose a document parsing benchmark"
            className="grid grid-cols-3 border-b border-border"
            role="tablist"
          >
            {benchmarks.map((candidate, index) => {
              const selected = index === benchmarkIndex

              return (
                <button
                  aria-controls="benchmark-panel"
                  aria-selected={selected}
                  className={cn(
                    "relative min-h-14 min-w-0 border-border px-1 py-3 text-center text-xs font-medium transition-colors not-first:border-l sm:px-5 sm:text-left sm:text-sm",
                    selected
                      ? "bg-muted/55 text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  )}
                  key={candidate.id}
                  onClick={() => selectBenchmark(index)}
                  role="tab"
                  type="button"
                >
                  <span className="block font-mono text-[9px] tracking-tight text-primary uppercase sm:text-[11px] sm:tracking-normal">
                    {candidate.sourceName}
                  </span>
                  <span className="mt-0.5 block">{candidate.tabLabel}</span>
                  {selected && (
                    <span className="absolute inset-x-0 bottom-0 h-px bg-primary" />
                  )}
                </button>
              )
            })}
          </div>

          <div
            aria-live="polite"
            className="p-5 lg:p-6"
            id="benchmark-panel"
            role="tabpanel"
          >
            <div className="border-b border-border pb-5">
              <div>
                <a
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-primary uppercase transition-opacity hover:opacity-75"
                  href={benchmark.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {benchmark.sourceName}
                  <ArrowSquareOut className="size-3.5" />
                </a>
                <h3 className="mt-2 text-xl font-medium text-balance">
                  {benchmark.title}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {benchmark.description}
                </p>
              </div>
            </div>

            <div className="min-w-0 pt-5">
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Score metric"
              >
                {benchmark.metrics.map((candidate) => (
                  <button
                    aria-pressed={candidate.id === metric.id}
                    className={cn(
                      "border px-3 py-1.5 text-xs transition-colors",
                      candidate.id === metric.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                    key={candidate.id}
                    onClick={() => setMetricId(candidate.id)}
                    title={`${candidate.technicalLabel}: ${candidate.description}`}
                    type="button"
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>

              <ol
                className="mt-4 divide-y divide-border"
                key={`${benchmark.id}-${metric.id}`}
              >
                {visibleEntries.map((entry, index) => {
                  const score = entry.scores[metric.id]
                  if (typeof score !== "number") return null
                  const width = Math.max(
                    score === 0 ? 0 : 2,
                    Math.min(100, (score / metric.maximum) * 100)
                  )
                  const supported = resolveSupportedBenchmarkProvider(
                    entry.name
                  )

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
                      <span className="col-start-3 row-start-1 text-right font-mono text-sm tabular-nums md:col-start-4">
                        {score.toFixed(metric.decimals)}
                        {metric.suffix}
                      </span>
                    </li>
                  )
                })}
              </ol>

              <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                {benchmark.snapshotLabel} · {benchmark.methodologyNote}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
