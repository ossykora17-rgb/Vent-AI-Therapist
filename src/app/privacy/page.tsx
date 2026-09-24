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

      {/*
        The age flag named where the rest is named.

        This page's own rule, two sections down: a new thing kept about
        somebody belongs on the page that lists what is kept about somebody, on
        the same day it starts being kept. `mw-age-ok` never leaves the device
        and there is no column for it — which makes it *smaller* than the rest
        of this list and no less owed a sentence, because "that's all" is a
        claim and a claim with an exception is false.
      */}
      <p>
        One more thing lives on your device and never reaches us: a flag saying
        you confirmed your age. It is not sent anywhere, there is no row for it,
        and the delete button below clears it with everything else.
      </p>

      <h2>What we never ask for</h2>
      <p>
        No name, no email, no phone number, no password. There is no account.
        We cannot identify you, and neither can anyone who reads the database.
      </p>

      {/*
        Circles named on the page a person reads, not only in the README.

        The close used to keep nothing at all, so this section did not need to
        exist. The return leg changed that: one word now crosses out of a room
        and lands in a column that outlives it. A new thing kept about somebody
        belongs on the page that lists what is kept about somebody, on the same
        day it starts being kept — not in a commit message.
      */}
      <h2>In a circle</h2>
      <p>
        Everything anyone types in a circle is deleted when the circle ends —
        the whole transcript, and the seats with it. One thing survives, and
        only because you chose it: the word you say you are carrying out. It
        goes to your own Memory page, where you can read it and delete it.
        Nobody else&apos;s words follow you out, and neither does a summary of
        the room.
      </p>

      <h2>Who can read it</h2>
      <p>
        Row-level security is switched on with no public policies, so the
        browser-facing key can read nothing at all. Every read and write goes
        through our server, which scopes each query to your anonymous id.
      </p>

      {/*
        Name who actually sees it, not who we planned for.

        This said "sent to Anthropic" and had said so while every message for
        days was in fact answered by Groq — Anthropic's balance is empty and
        the chain moved on without telling the one page whose job is to say
        where the words go. A confidentiality promise that names the wrong
        company is not a smaller problem than naming none.

        So: the whole list, and the honest mechanism. It is a chain, the first
        one that answers wins, and which one that is changes with the hour. If
        a provider is ever added, it is added here in the same commit — that
        is the rule this paragraph exists to enforce on us.
      */}
      <h2>Your words and the AI</h2>
      <p>
        {/* "This deployment may use" — a word for a copy of the software,
            in the one document written to be read by somebody who has never
            deployed anything. The naming of the processors below is required
            and stays; the jargon around it does not. */}
        When you vent, your message and your recent history are sent to an AI
        provider to generate the reply. Mind Weave may use any of{" "}
        <strong>Anthropic</strong>, <strong>Google</strong>,{" "}
        <strong>Groq</strong>, <strong>Zhipu</strong>,{" "}
        <strong>DeepSeek</strong>,{" "}
        <strong>OpenRouter</strong> or <strong>Cerebras</strong>: they are
        tried in order and the first one that answers is the one that sees it,
        so which company handles a given message depends on which are reachable
        at that moment. Zhipu and DeepSeek are based in China; the others are
        in the United States.
      </p>
      <p>
        Nothing identifying goes with it. No name, no email, no account — only
        the words and the anonymous id made on your own device.
      </p>
      <p>
        Questions about the date, greetings, and anything flagged as a crisis
        are answered on our own server and are never sent to a model at all.
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
