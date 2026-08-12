# Ẹ̀rí — operating strategy

Companion to `ip-bank-concept.md`. That document argues the shape. This one
is the four-hat build-out: where we win, what we build, how it runs, and
what it costs.

Written from the chair of whoever has to make it survive contact.

---

## Part I — Where we win

### The graveyard is the most useful document in this market

**WIPO PROOF sold roughly 3,000 tokens in its first year against a target of
up to 100,000, and was discontinued on 1 February 2022.**

Sit with that. WIPO is the single most credible timestamp issuer that could
exist: a UN agency, global distribution, the actual registry authority,
institutional trust no startup will ever buy. Its own Director General's
stated reason was that the private sector already did this — and the market's
verdict was that securing a file this way was slow, costly, and legally
inert.

If WIPO could not sell a timestamp, nobody can sell a timestamp.

This is the most important competitive fact we have, and it points one way:
**anybody pitching you a vault is pitching a corpse.** Custody is the free
tier, permanently, and it exists only to acquire the ownership data. We
never charge for it and we never lead with it.

### The competitive map

| Category | Who | What they actually do | Why we are not them |
| --- | --- | --- | --- |
| Timestamp vaults | WIPO PROOF (dead), Safe Creative, Copyrighted.com, blockchain-seal vendors | Sell proof-of-existence | Proven dead market. This is our free tier |
| Music credits/splits | Muso.AI, Sound Credit, Vydia, Revelator, Session | Credits and metadata, post-release, for signed/distributed catalogue | They capture *after* distribution. We capture in the room, pre-release. No identity rails, no enforcement, no settlement |
| Nigerian incumbent | **Freeme Digital** (2013, Lagos, Michael Ugwu; Revelator-powered KORA dashboard, mobile-first, handles royalty split changes) | Distribution + label services + publishing | They are a **counterparty to the deal**. We are neutral infrastructure. A distributor cannot arbitrate a dispute involving its own artists |
| Royalty advances | beatBread, Duetti, Sound Royalties, Hipgnosis-style funds | Advance against verified streaming income | None underwrite Nigerian income at scale. They need clean title — which is exactly what does not exist here, and exactly what we manufacture |
| IP tokenisation | IPwe, Story Protocol, NFT-era patent plays | Put rights on a chain | Cautionary tale, not competition. We ship no token |
| AI data marketplaces | **Human Native (acquired by Cloudflare, Jan 2026)**, Troveo, Protege, Defined.ai | Match corpora to labs | See below. This changes our position |

### The Cloudflare signal, and what it means

Cloudflare acquiring Human Native in January 2026 tells us the marketplace
layer is consolidating into infrastructure. An infrastructure company with
20% of the web's traffic will own the pipe between content and labs.

The strategic read is unambiguous: **do not build a marketplace.** We would
be competing with Cloudflare's distribution on their timeline. Instead we
become the thing the marketplace cannot manufacture and must source —
a corpus with **clean, consented, individually-attributed title**.

Marketplaces are matching layers. They have a permanent supply problem:
provenance. We are supply, with provenance, in a category nobody else has
title to.

### The actual insight: labs do not buy data, they buy indemnity

Training data is abundant. Nigerian speech and text can be scraped by
anyone with a crawler. What cannot be scraped is the right to use it without
being sued, and the documentation to prove that right in a deposition.

Every content-licensing deal signed since 2023 is fundamentally an indemnity
purchase. That is why News Corp got a reported $250M over five years from
OpenAI and Reddit gets roughly $60M a year from Google for material that was
already publicly readable. They were not selling access. They were selling
the ability to stop worrying.

Only a corpus where consent was captured **at deposit, per contributor,
against a verified identity, revocably** can offer that. You cannot retrofit
it. This is why the split-sheet product and the AI-licensing business are the
same business, and why the order cannot be reversed.

### Our moat, in order of durability

1. **The ownership graph.** A verified, growing map of who owns what in
   Nigerian creative output. Every session deposit pulls in four to six new
   identity-verified users, and every new work makes the graph more valuable
   for licensing and underwriting. This compounds and cannot be bought.
2. **Clean title at scale in a market everyone else finds illegible.** The
   asset is not the files. It is the chain of title.
3. **Regulatory position.** NOTAP automation, NDPA compliance, NIN/BVN/CAC
   integration. Slow, unglamorous, and a genuine barrier.
4. **Neutrality.** We are not a label, not a distributor, not a CMO. We take
   no ownership and no exclusivity, so we can sit between parties who do not
   trust each other. Freeme cannot do this. Nor can a label.
5. **Corporate Clean Room contracts.** Sticky, multi-year, and they fund
   everything else.

### Win condition, one sentence

> We win by becoming the only party that can deliver clean title at scale in
> a market everyone else finds illegible — and then selling that title three
> times: to the creator as proof, to the corporate as defence, and to the
> lab as indemnity.

### Kill criteria

Defined up front, because a plan without them is a wish:

- **Month 3:** if fewer than 40% of sessions run by an anchor producer
  complete a multi-party split, the viral mechanic is broken and the entire
  sequence fails. Stop and redesign the capture flow, do not proceed to
  Phase 1.
- **Month 9:** if we cannot close 3 paying Clean Room seats, the enterprise
  thesis is wrong and the free tier has no funder. Re-price or pivot to a
  paid creator tier.
- **Month 18:** if the ownership graph has under 25,000 verified works with
  complete splits, we do not have a licensable corpus and the Phase 3 thesis
  is dead. Do not raise on it.
- **Anytime:** a single unauthorised disclosure of deposit contents ends the
  company. There is no recovery plan for this and we should not pretend there
  is one.

---

## Part II — What we build

### Non-negotiable architecture decisions

**Client-side encryption, no operator read access.** Per-work data key,
wrapped to each participant's device key. Server stores ciphertext, content
hashes, and signatures. We hold no plaintext.

**Key recovery is the hard problem and we must be honest about it.** People
lose phones constantly, and a vault that loses your masters is worse than no
vault. The design: per-work key wrapped to (a) each participant's device
key, and (b) a recovery share held by an independent escrow agent under a
published disclosure policy. Operator alone cannot read. Operator plus
escrow agent, under a court or arbitral order, can. We state this plainly in
the interface rather than claiming an absolute we do not have.

**Signatures, not assertions.** Each participant signs a canonical
serialisation of the split with an Ed25519 device key. The split sheet is
the set of signatures. We are a witness to signatures, not the author of a
record.

**Merkle-batched anchoring.** Hourly root, RFC 3161 timestamp authority plus
a public anchor. Batched so cost per deposit is fractions of a naira at any
volume.

**Local-first, dual timestamps.** Capture works offline, queues, syncs. The
record carries capture time and sync time, and the interface never presents
an unsynced local time as proven. An assertion and a proof render
differently.

**Tamper-evident access logs.** Hash-chained receipt log. Watermarked
streaming for disclosure, download off by default.

### The USSD constraint nobody thinks through

USSD cannot carry files. So USSD is not for depositing — it is for
**confirming**. The producer with a smartphone starts the session and
uploads; the session musician on a feature phone receives a code and
confirms their percentage over USSD in four keystrokes.

That asymmetry is correct anyway. The person with the least equipment is the
person we most need to include, and confirmation is the action that actually
matters for them.

### Identity stack

NIN via NIMC-licensed verification agents, BVN via NIBSS, CAC for corporate
counterparties. We store verification attestations and salted hashes —
**never raw NIN or BVN**. Holding biometric-linked identifiers alongside
creative works is the single largest NDPA exposure in the system and should
be designed by someone who has been audited before.

### The watchtower

Perceptual hashing — audio fingerprints, image pHash, code similarity — run
continuously against DSP catalogues, app stores, the trade marks journal,
and CAC registrations. When a member's work appears somewhere it should not,
we tell them, and the receipt log assembles the case automatically.

Nobody does this for the small rights holder. It is the difference between
a filing cabinet and a bank.

### What we explicitly refuse to build

- **No token, no chain of our own, no NFT.** IPwe raised heavily on exactly
  this and it did not work. A public timestamp anchor is fine; a tokenised
  rights economy is a distraction that costs us regulatory standing.
- **No exclusivity, ever.** The moment we require it we are a rights grab.
- **No marketplace in Phase 1–2.** Cloudflare will own that layer.
- **No single-number valuations** shown to a creator. Bands with confidence,
  or nothing.

### Credit discipline in the system itself

Most operations must never touch a model: identity checks, hashing,
anchoring, split arithmetic, settlement, watchtower triage on perceptual
hashes. Model calls are reserved for contract parsing and ambiguous
similarity review — the two places where they earn their cost. Anything that
runs per-deposit must be free to run, or the unit economics of a free tier
collapse at exactly the moment we succeed.

---

## Part III — How it runs

### The first 90 days

Ten anchor producers, paid as design partners. Not influencers — working
producers with credits who host four or more sessions a week. They bring the
room; the room installs to sign.

Physical insertion: a printed card on the studio wall with a QR code. The
product must be present where the work happens, at 2am, without a data plan.

Target by day 90: 10 producers, 300 completed multi-party splits, 1,200
identity-verified creators. Measured against the month-3 kill criterion.

### Enterprise runs in parallel, not after

Clean Room sales cycles into Nigerian banks and telcos run six to nine
months. Starting them after Phase 0 means revenue at month 18. Start them at
week 1: three banks, two telcos, five VCs. First close targeted month 9.

The pitch is not "protect creators." It is: *"When a founder claims you
copied them, what do you produce?"*

### Legal operations

- Panel of three firms on fixed-fee retainer for demand letters. Volume
  pricing, standard templates, no bespoke drafting below a threshold.
- Named arbitration panel of five, published fee scale, hard 45-day
  timetable from filing to award. The speed is the product; publish it.
- In-house or partnered accredited filing agents. Nigerian registry practice
  is agent-dominated and touting is a real risk to customers filing on our
  recommendation.

### Trust operations

This is a function, not a value. It gets a named owner and a monthly cadence:

- Publish the payout ledger monthly. Every naira in, every naira out, per
  work.
- Publish dispute counts and outcomes, including the ones we lost.
- Publish our take rate next to prevailing CMO rates.
- One-click, complete data export, including on the way out.

Nigerian creatives have been failed by collection intermediaries before.
That distrust is earned and correct. Arithmetic is the only answer.

### Hiring order

1. Head of Trust & Rights Operations (from the music industry, not tech)
2. Security engineer (owns the encryption posture; hire before scale, not after)
3. Two full-stack engineers
4. Enterprise seller (banking/telco relationships)
5. In-house counsel / IP filing lead
6. Producer relations (two, on the ground in Lagos studios)

---

## Part IV — The money

*FX assumption ₦1,600/USD. Nigerian rates and FX are volatile; treat every
naira figure as indexed, not fixed. Cost of capital assumes a policy rate in
the mid-to-high 20s — confirm current MPR before pricing advances.*

### Pricing

| Line | Price | Notes |
| --- | --- | --- |
| Creator deposits & splits | **Free, permanently** | Acquisition, not revenue. Never charge |
| Startup/SME | ₦25,000/mo (~$16) | Receipts, filings, watchtower |
| Corporate Clean Room seat | ₦19M–₦120M/yr ($12k–$75k) | The profit engine |
| Defence Mutual | ₦60,000/yr (~$38) | Or bundled into SME |
| Licence transactions | 12% | Below marketplace norms |
| Collection & settlement | 10% | Published, deliberately below CMO norms |
| Advances | Discount to NPV of 3-yr verified stream | Priced off actual cost of capital |
| NOTAP / registry filings | Fixed fee per action | High margin, low glamour |
| AI data licensing | 15% admin / **85% to contributors** | The 85% is a public commitment |

### Default-alive math

A 25-person Lagos team, mixed local and USD-denominated senior comp, runs
roughly **$800k/year** fully loaded including infra, legal panel, and
arbitration subsidy.

At a $40k average Clean Room seat, **20 corporate seats makes us default-
alive** with the entire creator side free forever. That is the whole
financial thesis in one line, and it is achievable: there are more than 20
banks, telcos, and serious corporates in Lagos with an innovation function
and a copycat-litigation fear.

Everything else — mutual premiums, SME subscriptions, filings — is margin on
top, not survival.

### The step change

The AI corpus is not incremental revenue, it is a different business
arriving on top of the first one.

Market context: AI training data licensing was roughly **$4.4B in 2026**,
projected toward $22B by 2034. Individual deals run from **$5M to $250M** —
News Corp/OpenAI at a reported $250M over five years, Reddit/Google at
roughly $60M a year.

Target: one anchor multilingual deal — Yoruba, Igbo, Hausa, Naija Pidgin
speech and text, plus Nigerian-accented ASR corpora — at **$3–8M over three
years by month 30.** At 15% admin that is $450k–$1.2M to us, and
**$2.5M–$6.8M distributed to Nigerian contributors** who currently receive
nothing.

That distribution is the point, and it is also the best marketing asset the
company will ever have. The first payout run is the story that ends the
trust problem.

### Funding

Raise **$2.5M seed** for 30 months to a proven Phase 2. Raise on the
ownership graph and the indemnity thesis — never on the vault, which is a
category the market has already killed.

Do not spend on: a marketplace build, a token, exclusivity acquisition of
catalogues, or paid creator acquisition. The mechanic is viral by
construction; if it needs paid acquisition, the month-3 kill criterion has
already told us so.

### Scenarios at month 30

| | Seats | Works w/ full splits | Data deal | Position |
| --- | --- | --- | --- | --- |
| **Downside** | 8 | 15,000 | none | Default-dead. Cut to 12 people, SME-funded, survive |
| **Base** | 20 | 40,000 | $3M/3yr signed | Default-alive, Series A on the graph |
| **Upside** | 35 | 90,000 | $8M/3yr + second lab in diligence | Category owner. Cloudflare and the labs come to us |

---

## The honest summary

We are not building a vault, because WIPO already proved nobody buys one. We
are not building a marketplace, because Cloudflare just bought the one that
mattered. We are building the **ownership graph** for Nigerian creative and
inventive output — captured at the moment of creation when the truth is
still cheap to tell, verified against real identity, and sold three ways: as
proof to the creator, as defence to the corporate, and as indemnity to the
lab.

The corporates fund the free tier. The free tier builds the graph. The graph
is the only thing that becomes more valuable the more of it exists, and the
only thing a competitor cannot buy.

Twenty enterprise logos and one anchor data deal, and this is a real company.
