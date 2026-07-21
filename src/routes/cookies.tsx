import { createFileRoute } from "@tanstack/react-router"

import { LegalPage } from "@/components/legal-page"
import type { LegalDocument } from "@/components/legal-page"

const cookieDocument = {
  description:
    "This policy explains how FileRouter uses cookies and browser storage for authentication, security, preferences, and scheduling.",
  sections: [
    {
      title: "What these technologies are",
      body: "Cookies are small files stored by your browser. Browser storage includes local storage and similar technology that lets a web application remember information on your device. ThinkEx Inc. uses these technologies to operate FileRouter.",
    },
    {
      title: "Required cookies",
      body: "FileRouter uses required cookies for sign-in, session management, account security, and request handling. These cookies are necessary for the dashboard and authenticated features to work. Blocking them may prevent you from signing in or using the hosted service.",
    },
    {
      title: "Preferences",
      body: "FileRouter uses browser storage to remember preferences such as light or dark theme. These preferences are stored on your device so the interface remains consistent between visits.",
    },
    {
      title: "Scheduling",
      body: "The Talk to the team button uses a Cal.com scheduling embed. Cal.com may receive technical information and use cookies or similar technology when its scheduling experience loads or when you interact with it. Information you submit to book a meeting is handled under Cal.com's terms and privacy notice as well as used by ThinkEx to arrange the requested meeting.",
    },
    {
      title: "Analytics and advertising",
      body: "FileRouter uses PostHog for page, product-usage, error, and session-replay analytics. PostHog may use cookies and browser storage to connect activity across pages and visits. FileRouter masks form inputs, excludes credential surfaces such as generated API keys and CLI device codes from recordings, and removes query strings from captured URLs. FileRouter does not use advertising cookies.",
    },
    {
      title: "Managing cookies",
      items: [
        "You can delete or block cookies and browser storage through your browser settings.",
        "Blocking required cookies can break authentication, account security, and dashboard access.",
        "Clearing browser storage may reset your theme, analytics identifiers, and other local preferences.",
      ],
    },
    {
      title: "Changes",
      body: "We may update this policy when FileRouter's authentication, scheduling, analytics, or storage practices change. The current version and update date will remain available on this page.",
    },
    {
      title: "Contact",
      body: "Questions about FileRouter cookies can be sent to hello@thinkex.app.",
    },
  ],
  title: "Cookie Policy",
} satisfies LegalDocument

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — FileRouter" },
      { name: "description", content: cookieDocument.description },
      { property: "og:title", content: "Cookie Policy — FileRouter" },
      {
        property: "og:description",
        content: cookieDocument.description,
      },
      { property: "og:url", content: "https://filerouter.dev/cookies" },
    ],
    links: [{ rel: "canonical", href: "https://filerouter.dev/cookies" }],
  }),
  component: CookiesPage,
})

function CookiesPage() {
  return <LegalPage document={cookieDocument} />
}
