import { ArrowSquareOut } from "@phosphor-icons/react"
import { useState } from "react"

import { BenchmarkCostScatter } from "@/components/benchmark-cost-scatter"
import { BenchmarkLatencyScatter } from "@/components/benchmark-latency-scatter"
import { BenchmarkRankedList } from "@/components/benchmark-ranked-list"
import { benchmarks, type BenchmarkMetricId } from "@/lib/benchmark-data"
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
  const sourceNote = `${benchmark.snapshotLabel} · ${benchmark.methodologyNote}`

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
            No single engine wins every doc. Here&apos;s the tradeoff.
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
                  {selected ? (
                    <span className="absolute inset-x-0 bottom-0 h-px bg-primary" />
                  ) : null}
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

            <div className="min-w-0 pt-5">
              <div
                aria-label="Score metric"
                className="flex flex-wrap gap-2"
                role="group"
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

              {benchmark.presentation === "cost-scatter" ? (
                <BenchmarkCostScatter
                  entries={benchmark.entries}
                  metric={metric}
                  sourceNote={sourceNote}
                />
              ) : null}
              {benchmark.presentation === "latency-scatter" ? (
                <BenchmarkLatencyScatter
                  entries={benchmark.entries}
                  metric={metric}
                  sourceNote={sourceNote}
                />
              ) : null}
              {benchmark.presentation === "ranked-list" ? (
                <>
                  <BenchmarkRankedList
                    entries={benchmark.entries}
                    key={`${benchmark.id}-${metric.id}`}
                    metric={metric}
                  />
                  <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                    {sourceNote}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
