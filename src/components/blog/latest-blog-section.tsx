import { ArrowRight } from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"

import { formatBlogDate, publishedBlogPosts } from "@/lib/blog"

export function LatestBlogSection() {
  const posts = publishedBlogPosts.slice(0, 3)
  if (posts.length === 0) return null

  return (
    <section
      aria-label="Latest blog posts"
      className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20"
    >
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Blog
        </h2>
        <Link
          className="hidden items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline-flex"
          to="/blog"
        >
          View all
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-3 lg:gap-6">
        {posts.map((post) => (
          <Link
            className="group flex min-h-52 flex-col rounded-none border border-border bg-background p-5 text-foreground no-underline transition-colors hover:border-foreground/25"
            key={post.slug}
            params={{ slug: post.slug }}
            to="/blog/$slug"
          >
            <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {post.category}
            </div>
            <h3 className="mt-3 text-xl font-medium tracking-tight text-balance transition-colors group-hover:text-foreground/75">
              {post.title}
            </h3>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
              {post.description}
            </p>
            <div className="mt-auto flex items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
              <span>{formatBlogDate(post.date)}</span>
              <span>{post.readingMinutes} min read</span>
            </div>
          </Link>
        ))}
      </div>
      <Link
        className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:hidden"
        to="/blog"
      >
        View all
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  )
}
