import { ArrowRight } from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { BlogShell } from "@/components/blog/blog-shell"
import { blogCategories, type BlogCategory } from "@/lib/blog-categories"
import { formatBlogDate, publishedBlogPosts } from "@/lib/blog"

type CategoryFilter = "All" | BlogCategory
const categoryFilters: CategoryFilter[] = ["All", ...blogCategories]

export function BlogIndexPage() {
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>("All")
  const posts =
    selectedCategory === "All"
      ? publishedBlogPosts
      : publishedBlogPosts.filter((post) => post.category === selectedCategory)

  return (
    <BlogShell>
      <section>
        <div className="mx-auto w-full max-w-7xl px-6 py-10 sm:py-14">
          <h1 className="text-4xl font-medium tracking-tight text-balance sm:text-5xl">
            Blog
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Practical guides, product updates, and engineering notes about
            document parsing across providers.
          </p>

          <div className="mt-8 flex flex-wrap gap-3 border-b border-border pb-5 text-sm">
            {categoryFilters.map((category) => (
              <button
                className={
                  category === selectedCategory
                    ? "h-10 rounded-full bg-foreground px-5 font-medium text-background transition-colors"
                    : "h-10 rounded-full bg-muted px-5 font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                }
                key={category}
                onClick={() => setSelectedCategory(category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>

          <div className="divide-y divide-border">
            {posts.map((post) => (
              <Link
                className="group grid gap-4 py-8 text-foreground no-underline md:grid-cols-[8rem_minmax(0,1fr)_12rem] md:items-start md:gap-8 lg:grid-cols-[9rem_minmax(0,1fr)_16rem]"
                key={post.slug}
                params={{ slug: post.slug }}
                to="/blog/$slug"
              >
                <div className="text-sm text-muted-foreground">
                  {formatBlogDate(post.date)}
                </div>
                <div className="min-w-0 lg:max-w-3xl">
                  <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    {post.category}
                  </div>
                  <h2 className="mt-2 text-2xl font-medium tracking-tight text-balance transition-colors group-hover:text-foreground/75">
                    {post.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {post.description}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{post.author}</span>
                    <span aria-hidden="true">/</span>
                    <span>{post.readingMinutes} min read</span>
                  </div>
                </div>
                <div className="md:justify-self-end">
                  {post.image ? (
                    <div className="aspect-[16/10] overflow-hidden rounded-md border border-border bg-muted md:w-48 lg:w-64">
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        decoding="async"
                        loading="lazy"
                        src={post.image}
                      />
                    </div>
                  ) : (
                    <ArrowRight className="mt-1 hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground md:block" />
                  )}
                </div>
              </Link>
            ))}
          </div>

          {posts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              {selectedCategory === "All"
                ? "The first FileRouter posts are on the way."
                : "No posts in this category yet."}
            </div>
          ) : null}
        </div>
      </section>
    </BlogShell>
  )
}
