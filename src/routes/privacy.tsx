import { createFileRoute } from "@tanstack/react-router"

import { LegalPage } from "@/components/legal-page"
import type { LegalDocument } from "@/components/legal-page"
import { buildPublicMeta, getAbsoluteUrl } from "@/lib/seo"

const privacyDocument = {
  description:
    "This policy explains how ThinkEx Inc. collects, uses, shares, and retains information when you use FileRouter.",
  lastUpdated: "July 22, 2026",
  sections: [
    {
      title: "Who we are",
      body: 'ThinkEx Inc. ("ThinkEx," "we," "us," and "our") operates FileRouter. We are responsible for personal information used to run the website, accounts, and hosted service. When a customer submits document content for hosted processing, we process that content on the customer\'s instructions to provide the service. You can contact us at hello@thinkex.app.',
    },
    {
      title: "Information we collect",
      items: [
        "Account information, such as your name, email address, profile image, email-verification status, and Google sign-in identifiers when you choose Google authentication.",
        "Session and security information, such as session identifiers, IP address, user agent, authentication events, device-authorization codes, and related timestamps.",
        "API-key information, such as key name, prefix, permissions, creation and expiration dates, request counts, rate-limit state, and last-use time.",
        "Document-job information, such as filenames, source URLs, selected providers, requested outputs, page selections, provider options, job status, errors, page count, timestamps, and request or idempotency hashes.",
        "Document contents and results when you use FileRouter-hosted processing, including uploaded source files and provider responses you ask FileRouter to return or retain.",
        "Operational and product information, such as request identifiers, page visits, clicks and product actions, session replays, service errors, infrastructure logs, and diagnostic data needed to secure, operate, and improve the service.",
        "Communications and scheduling information you provide when you contact us, join the community, request support, or book a meeting through Cal.com.",
      ],
    },
    {
      title: "How we use information",
      items: [
        "To authenticate users, issue and manage API keys, and maintain account and CLI sessions.",
        "To accept documents, create jobs, call selected providers, normalize results, and return or compare outputs.",
        "To prevent duplicate submissions, enforce limits, detect abuse, investigate errors, and protect FileRouter and its users.",
        "To maintain, debug, support, and improve the website, SDK, CLI, API, and hosted infrastructure.",
        "To communicate about support, security, service changes, and meetings you request.",
        "To comply with law, enforce our terms, and establish or defend legal claims.",
      ],
    },
    {
      title: "How document processing works",
      body: "Hosted requests pass through FileRouter infrastructure. We send the document and applicable options to the provider or providers selected for the job. Comparison requests send the document to every selected provider. Direct or BYOK SDK and CLI requests call the provider from your environment and do not send that request through FileRouter's hosted service, although the selected provider still receives and processes the document.",
    },
    {
      title: "Service providers and recipients",
      body: "We use Cloudflare for application hosting, networking, logs, databases, durable workflows, and object storage; PostHog for product analytics, error tracking, and session replay; Autumn for usage metering and billing records; Google for optional sign-in; and Cal.com for meeting scheduling. A hosted job may use FileRouter's native LiteParse or PDF Inspector engine, or send content to the external provider you select, including LlamaParse, Mistral AI, or Datalab. We may add or replace providers as FileRouter evolves. External providers process information under their own terms and privacy notices, and their retention may differ from FileRouter's.",
    },
    {
      title: "Retention",
      items: [
        "Hosted source documents are scheduled for deletion seven days after upload. An active job may delay source cleanup until it finishes.",
        "Completed hosted results are scheduled to expire seven days after completion.",
        "Hosted document-job records are scheduled for deletion 30 days after creation.",
        "You can delete a stored document and its FileRouter job data sooner through the hosted API. FileRouter also maintains a 14-day object-storage lifecycle as a backstop if application cleanup is delayed.",
        "Account, authentication, API-key, security, and support records are kept while needed to provide and secure the service, comply with law, resolve disputes, and enforce agreements.",
        "Third-party providers apply their own retention practices to information sent to them.",
      ],
    },
    {
      title: "Legal bases and international processing",
      body: "Where data-protection law requires a legal basis, we process information as needed to provide the service and perform our contract with you, for legitimate interests such as security and service improvement, with consent where requested, and to comply with legal obligations. ThinkEx and its providers may process information in the United States and other countries, which may have different data-protection laws from your location.",
    },
    {
      title: "Cookies and browser storage",
      body: "FileRouter uses cookies and browser storage for authentication, session security, preferences such as theme, and PostHog analytics. PostHog session replay masks form inputs, excludes generated API keys and CLI device codes, and removes query strings from captured URLs. The Cal.com scheduling experience may use its own cookies or similar technology. See the FileRouter Cookie Policy for more information.",
    },
    {
      title: "Your choices and rights",
      items: [
        "You can revoke API keys from the dashboard and can stop using hosted processing by using direct or BYOK mode where supported.",
        "You can delete a hosted document and its retained FileRouter results and job records through the API.",
        "You can control cookies and browser storage through your browser, although blocking required cookies may prevent sign-in or dashboard access.",
        "Depending on where you live, you may have rights to access, correct, delete, restrict, object to, or receive a copy of personal information. Contact us to make a request.",
        "We may need to verify your identity before completing a request and may retain information where law permits or requires.",
      ],
    },
    {
      title: "Security",
      body: "We use technical and organizational safeguards designed to protect information, including authenticated job access, scoped API-key permissions, hashed replay identifiers, signed short-lived source URLs, provider-option validation, and retention cleanup. No internet service can guarantee complete security.",
    },
    {
      title: "Children",
      body: "FileRouter is not directed to children under 13. If you believe a child has provided personal information through FileRouter, contact us so we can take appropriate action.",
    },
    {
      title: "Changes",
      body: "We may update this policy as FileRouter, its providers, or legal requirements change. We will post the current version here and update the date above. We will provide additional notice when reasonably required.",
    },
    {
      title: "Contact",
      body: "For privacy questions or requests, email hello@thinkex.app.",
    },
  ],
  title: "Privacy Policy",
} satisfies LegalDocument

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: buildPublicMeta({
      title: privacyDocument.title,
      description: privacyDocument.description,
      path: "/privacy",
    }),
    links: [{ rel: "canonical", href: getAbsoluteUrl("/privacy") }],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return <LegalPage document={privacyDocument} />
}
