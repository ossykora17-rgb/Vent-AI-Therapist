import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Mind Weave stores, what it never stores, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <h2>What we store</h2>
      <p>
        An anonymous id generated in your browser, the words you write, the AI
        replies, and the readings you give us — mood, pressure, where it sits in
        the body. That&apos;s all.
      </p>

      <h2>What we never ask for</h2>
      <p>
        No name, no email, no phone number, no password. There is no account.
        We cannot identify you, and neither can anyone who reads the database.
      </p>

      <h2>Who can read it</h2>
      <p>
        Row-level security is switched on with no public policies, so the
        browser-facing key can read nothing at all. Every read and write goes
        through our server, which scopes each query to your anonymous id.
      </p>

      <h2>Your words and the AI</h2>
      <p>
        When you vent, your message and recent history are sent to Anthropic to
        generate the reply. Questions about the date, greetings, and anything
        flagged as a crisis are answered on our own server and are never sent to
        a model.
      </p>

      <h2>Deleting it</h2>
      <p>
        <strong>History → Delete everything</strong> removes every vent and your
        anonymous id from the database in one action. Clearing your browser
        storage detaches this device from its history. Export your data as JSON
        first if you want to keep it.
      </p>

      <h2>What we don&apos;t do</h2>
      <p>
        We do not sell data, we do not run advertising trackers, and we do not
        share your vents with anyone.
      </p>
    </LegalPage>
  );
}
