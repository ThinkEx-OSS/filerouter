import { createFileRoute } from "@tanstack/react-router"

import { LegalPage } from "@/components/legal-page"
import type { LegalDocument } from "@/components/legal-page"

const termsDocument = {
  description:
    "These terms govern your use of FileRouter's website, hosted document-processing service, API, SDK, and CLI.",
  sections: [
    {
      title: "Agreement",
      body: 'These Terms of Service are an agreement between you and ThinkEx Inc. ("ThinkEx," "we," "us," and "our"), which operates FileRouter. By accessing or using FileRouter, you agree to these terms. If you use FileRouter for an organization, you represent that you have authority to bind that organization.',
    },
    {
      title: "The FileRouter service",
      body: "FileRouter provides software and hosted infrastructure for sending documents to document-processing providers, normalizing provider results, and comparing outputs. FileRouter may include a website, dashboard, hosted API, SDK, CLI, documentation, and related services. Features, providers, limits, and availability may change as the service develops.",
    },
    {
      title: "Accounts and API keys",
      items: [
        "You must provide accurate account information and keep your account, sessions, and API keys secure.",
        "You are responsible for requests made through your account or API keys and for promptly revoking credentials you believe are compromised.",
        "We may apply rate limits, usage limits, or other safeguards and may suspend access that creates security, legal, or operational risk.",
      ],
    },
    {
      title: "Your documents and results",
      body: "You retain your rights in documents, URLs, instructions, provider options, and other content you submit, as well as in returned results to the extent permitted by law and third-party terms. You grant ThinkEx the limited permission needed to receive, store, copy, transmit, process, and delete that content to operate FileRouter and complete the requests you initiate.",
    },
    {
      title: "Your responsibilities",
      items: [
        "You must have the rights, permissions, and lawful basis needed to submit documents and personal information to FileRouter and the selected providers.",
        "You are responsible for choosing appropriate providers and processing modes for the sensitivity and regulatory requirements of your data.",
        "You must review parsed output before relying on it for legal, medical, financial, safety-critical, compliance, or other important decisions.",
      ],
    },
    {
      title: "Hosted and direct processing",
      body: "In hosted mode, documents and job information pass through FileRouter infrastructure and are sent to the providers selected for the request. A comparison sends the document to each selected provider. In direct or BYOK mode, the SDK or CLI calls the selected provider using credentials you configure; the provider still receives the document, but FileRouter's hosted service does not process that direct request. You are responsible for understanding the mode you use.",
    },
    {
      title: "Third-party providers",
      body: "Document-processing providers and other third-party services have their own terms, privacy practices, availability, limits, and output behavior. Your use of a provider may be subject to those terms. ThinkEx does not control third-party services and is not responsible for their acts, omissions, availability, security, retention, or results.",
    },
    {
      title: "Acceptable use",
      items: [
        "Do not submit content you do not have the right to process or use FileRouter to violate law or another person's rights.",
        "Do not upload malware, abusive content, or material intended to compromise FileRouter, a provider, or another system.",
        "Do not attempt to bypass authentication, rate limits, security controls, or usage restrictions; access another user's data; disrupt the service; or use the service to build or distribute harmful activity.",
        "Do not resell or provide access to the hosted service in a misleading or unauthorized way.",
      ],
    },
    {
      title: "Open-source software",
      body: "FileRouter software made available under an open-source license is governed by that license. These terms separately govern the FileRouter website, hosted service, accounts, API, and other services operated by ThinkEx.",
    },
    {
      title: "Fees",
      body: "Some FileRouter features may be free, metered, or paid. Any applicable pricing, credits, taxes, renewal terms, and payment obligations will be presented before you incur a charge. Provider charges incurred through direct or BYOK mode are between you and that provider.",
    },
    {
      title: "Output and availability",
      body: "Document parsing is probabilistic and provider-dependent. Results may be incomplete, inaccurate, delayed, duplicated, improperly formatted, or unavailable. FileRouter is provided on an as-is and as-available basis. We do not guarantee uninterrupted service, preservation of results, compatibility with every document, or suitability for a particular purpose.",
    },
    {
      title: "Termination",
      body: "You may stop using FileRouter at any time. We may restrict or terminate access if you violate these terms, create risk, fail to pay applicable charges, or if continued operation is not reasonably feasible. Provisions that by their nature should survive termination will continue to apply.",
    },
    {
      title: "Disclaimers and limitation of liability",
      body: "To the maximum extent permitted by law, ThinkEx disclaims all warranties and will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost data, profits, revenue, goodwill, or business opportunities arising from FileRouter or third-party providers. Nothing in these terms limits liability that cannot lawfully be limited.",
    },
    {
      title: "Changes",
      body: "We may update these terms as FileRouter changes. We will post the current version on this page and update the date above. If a change materially affects your rights, we will provide additional notice when reasonably required. Continued use after the effective date means you accept the revised terms.",
    },
    {
      title: "Contact",
      body: "Questions about these terms can be sent to hello@thinkex.app.",
    },
  ],
  title: "Terms of Service",
} satisfies LegalDocument

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — FileRouter" },
      { name: "description", content: termsDocument.description },
      { property: "og:title", content: "Terms of Service — FileRouter" },
      {
        property: "og:description",
        content: termsDocument.description,
      },
      { property: "og:url", content: "https://filerouter.dev/terms" },
    ],
    links: [{ rel: "canonical", href: "https://filerouter.dev/terms" }],
  }),
  component: TermsPage,
})

function TermsPage() {
  return <LegalPage document={termsDocument} />
}
