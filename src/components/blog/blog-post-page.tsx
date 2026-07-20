import { ArrowLeft } from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"
import type { BlogPost } from "content-collections"

import { BlogShell } from "@/components/blog/blog-shell"
import { BlogTableOfContents } from "@/components/blog/blog-table-of-contents"
import { formatBlogDate } from "@/lib/blog"

function AllPostsLink() {
  return (
    <Link
      className="inline-flex items-center gap-1.5 font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      to="/blog"
    >
      <ArrowLeft className="size-4" />
      All posts
    </Link>
  )
}

export function BlogPostPage({ post }: { post: BlogPost }) {
  return (
    <BlogShell>
      <article>
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 px-6 xl:max-w-[76rem] xl:grid-cols-[minmax(0,56rem)_14rem] xl:gap-10">
          <header className="py-12 sm:py-16 xl:col-start-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <AllPostsLink />
              <span aria-hidden="true">/</span>
              <span>{formatBlogDate(post.date)}</span>
              <span aria-hidden="true">/</span>
              <span>{post.readingMinutes} min read</span>
              <span aria-hidden="true">/</span>
              <span>{post.author}</span>
            </div>

            <h1 className="mt-4 text-4xl font-medium tracking-tight text-balance sm:text-5xl">
              {post.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              {post.description}
            </p>

            {post.image ? (
              <div className="mt-12 overflow-hidden rounded-md border border-border bg-muted">
                <img
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                  decoding="async"
                  loading="eager"
                  src={post.image}
                />
              </div>
            ) : null}
          </header>

          <div
            className="blog-prose min-w-0 pb-12 lg:pb-16 xl:col-start-1 xl:row-start-2"
            // Posts are trusted local Markdown rendered at build time.
            dangerouslySetInnerHTML={{ __html: post.html }}
          />

          {post.headings.length > 0 ? (
            <aside className="hidden xl:col-start-2 xl:row-start-2 xl:block">
              <BlogTableOfContents headings={post.headings} key={post.slug} />
            </aside>
          ) : null}
        </div>
      </article>
    </BlogShell>
  )
}
