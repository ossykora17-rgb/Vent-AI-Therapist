# Ẹ̀rí — an IP bank for Nigeria

**Working name: Ẹ̀rí** (Yoruba: *evidence, testimony, the witness*).
**One line: the bank you use before there is any money.**

This is a concept document, not a plan of record. It argues for a specific
shape, names what it cannot do, and flags the facts that need a Nigerian IP
lawyer's confirmation before anyone builds on them.

---

## 1. The wrong problem, and the right one

The obvious framing is theft: someone takes your idea and you cannot stop
them. That framing produces a vault — upload your file, get a timestamp,
sleep better. Dozens of those exist worldwide. Almost all of them are
worthless, because a timestamp is not a right and a vault is not an
enforcement mechanism.

The Nigerian problem is adjacent but different, and it is bigger.

**Ownership here is undocumented at the moment of creation, so value leaks
at every point downstream.** Not one theft — a thousand small failures of
record. A song with four uncredited contributors cannot be cleanly licensed.
A Nollywood film with an informal chain of title cannot be sold to a global
streamer without months of legal remediation. A shoemaker in Aba has no
registered design and no dated proof of one. A fintech founder pitched a
bank, has an NDA, and cannot prove what was in the room. A producer's
catalogue cannot be borrowed against, because no lender can see what he owns.

The theft is real. But most of the loss is not theft. It is **illegibility**
— work that cannot be proved, therefore cannot be collected on, licensed,
insured, inherited, or borrowed against.

That reframing changes what you build. A vault addresses theft, badly. A
**bank** addresses illegibility, and theft becomes one of four things it
handles.

---

## 2. What makes it a bank

Banks do four things: custody, clearing, credit, and market-making. Every
failed "protect your idea" startup did custody only, which is the commodity
and the loss leader. Ẹ̀rí does all four, and each layer makes the next
possible.

| Layer | Bank function | Product | What it fixes |
| --- | --- | --- | --- |
| 1 | Custody | **The Deposit** | Nobody can prove what they made, or when, or with whom |
| 2 | Clearing | **The Receipt** | Nobody can prove what they disclosed, to whom, on what terms |
| 3 | Credit | **The Mutual / The Advance** | You cannot afford to enforce, and you cannot borrow against what you own |
| 4 | Market | **The Exchange** | You cannot get paid, especially across a border |

The sequence matters and is not negotiable: layer 1 creates the structured
ownership data that makes layers 3 and 4 underwritable. Build the exchange
first and you have a marketplace with nothing provable on the shelves.

---

## 3. Layer 1 — The Deposit

Phone-first. Offline-tolerant. WhatsApp and USSD entry points, not an app
store download, because the person who most needs this is a session
musician on a ₦40,000 phone in a studio in Surulere with no data left.

Client-side hash, timestamp, anchor. That part is table stakes.

**The part that matters: a deposit is multi-party by default.**

You do not deposit alone. You deposit a *session*, and everyone in the room
confirms their contribution and their percentage from their own phone,
against their own verified identity. Ninety seconds. That is a split sheet,
executed before anyone knows whether the record is a hit.

This is the whole trick, and it is a behavioural insight rather than a
technical one:

> The truth about splits is only obtainable before there is money.
> Afterwards, every account is contaminated by what it is now worth.

Ask four people in a studio at 2am who did what, and you get an honest,
boring, accurate answer, because the stakes appear to be zero. Ask the same
four people eighteen months later with a global streaming hit, and you get
four irreconcilable stories and a lawsuit nobody can afford.

**Identity is the unlock.** NIN and BVN give real, verifiable identity that
makes a claim enforceable and — critically — makes a payment *routable*.
Most countries cannot do micro-splits to a session musician. Nigeria's
identity and instant-payment rails mean a 2% share can actually land in
somebody's account. That is a genuine structural advantage and it should be
exploited hard.

**Offline honesty rule.** Capture works with no connectivity and syncs
later. The record stores both capture time and sync time, and it never
presents the capture time as proven. An unsynced local timestamp is an
assertion, not evidence, and the interface must say which one it is holding.

---

## 4. Layer 2 — The Receipt

The disclosure rail. This is the layer that attacks theft directly, and it
is also the layer that pays for everything else.

In Nigeria the theft moment is almost always a disclosure moment: the pitch
to the bank or the telco, the supplier proposal, the grant application, the
accelerator pitch, the technical spec sent to a prospective partner. NDAs
get signed. They are almost never enforced, for two reasons: proving *what
was disclosed* is hard, and commercial litigation takes years.

So: **you never send the deck, the demo, or the master.** You send a link.
The recipient identifies themselves — NIN for an individual, CAC/RC number
for a company — accepts terms, and every access is logged: who, when, which
pages, how long, what was downloaded. Both sides receive a signed receipt.

"We never saw that" stops being available.

### The move that makes it adoptable

An anti-theft product that is hostile to the powerful party never gets
adopted, because the powerful party is the one with the budget. So sell the
mirror image of the same vault to the banks, telcos, and VCs:

**Clean Room Certificates** — proof of *independent prior creation*. A
corporate innovation team deposits its own roadmap and prototypes before
taking outside pitches. Now, when a founder claims they were copied, the
corporate can prove it was already building. That is worth real money to a
GTBank, an MTN, an Access, a Flutterwave, and it is the same infrastructure.

The result is a two-sided flywheel with the right party paying:

> **The victim does not pay. The defendant-in-waiting pays.**

Creators deposit free, forever, funded by corporate seats.

### Burden-shifting by contract

You cannot change Nigerian IP law. You *can* change the contract, and
Nigerian courts enforce contracts. So the standard disclosure terms carry an
evidential presumption: if the recipient launches something substantially
similar within, say, eighteen months of a Receipt, and cannot produce a
Clean Room deposit predating the disclosure, the contract deems it derived.

Design this as a **presumption**, not a penalty — a liquidated sum that is
not a genuine pre-estimate of loss risks being struck down. This clause is
the legal core of the product and it needs a real commercial litigator to
draft, not a template.

### Arbitration by default, because the courts are too slow

This is essential and it is where most concepts of this kind quietly fail.
An enforcement mechanism that terminates in a Nigerian commercial court
terminates in three to seven years, which means it does not exist. Every
Ẹ̀rí contract routes disputes to fast, cheap, expert arbitration with a
capped timetable — weeks, not years — under the Arbitration and Mediation
Act 2023. Binding and enforceable.

The 2023 Act is also, as I understand it, the first Nigerian statute to
expressly recognise third-party funding of arbitration, which repealed the
old common-law worry about champerty. If that is right, it is the legal
foundation for layer 3. **Confirm this before relying on it.**

---

## 5. Layer 3 — The Mutual and the Advance

### The Defence Mutual

Theft happens because the thief has correctly calculated that you cannot
afford to respond. Fix the calculation, not the morality.

A pooled subscription funds: automated letters of demand, statutory
notice-and-takedown against infringing listings and uploads (the Copyright
Act 2022 gave this real teeth, including blocking orders), and a small
number of selected arbitrations chosen on merit. Most of the value is
captured before any hearing — a credible, funded, fast threat settles the
large majority of these disputes.

### The Advance — the emotional centre of the whole thing

Nigerian artists sign away catalogues cheaply because they need money now.
Everybody in the industry knows this and it is the single most extractive
pattern in Nigerian creative life.

A bank that can advance naira against a **verified, documented, collectible**
royalty stream directly replaces that deal. Not charity — underwriting. And
it is only possible because layer 1 built the documentation that makes the
stream legible, and layer 4 built the collection that makes it measurable.

This is why the thing is called a bank. The vault's real purpose is not
protection. It is **manufacturing bankable collateral where none existed.**

Underwriting inputs: deposited splits, DSP statements (Boomplay, Audiomack,
Spotify, Apple), sync history, and the collection record from layer 4.

---

## 6. Layer 4 — The Exchange

### Getting people paid, in splits, automatically

Standard-form, machine-readable licences. Royalty settlement in naira and
USD. Payments split automatically per the deposited split sheet, down to the
session musician's 2%, using the instant-payment rails that already exist.

### The NOTAP automation nobody would think of

Any contract transferring foreign technology into Nigeria — licences,
trade mark use, technical services, franchise agreements — must be
registered with **NOTAP**, or the CBN will not permit the remittance of
royalties and fees. NOTAP also caps rates and durations.

This is a compulsory clearing house that already exists, it is slow and
paper-based, and it sits directly across the path of every cross-border IP
deal in the country. Automating NOTAP registration and the associated
CBN/remittance paperwork is a boring, unglamorous, extremely valuable
product. It is worth a business by itself, and no generic "idea vault" would
ever find it.

*Verify current NOTAP rate caps and duration limits before quoting any
number to a customer — my recollection is roughly 1–5% by category on
three-year renewable terms, but treat that as a starting point for
confirmation, not a fact.*

### The largest idea in this document: the AI data collective

Nigeria's most valuable untapped IP asset is **its language, music, image,
and video data**, and there is currently no mechanism for Nigerians to own,
license, or be paid for it.

Yoruba, Igbo, Hausa, and Naija Pidgin are low-resource languages that
frontier AI labs genuinely need and cannot easily obtain at quality.
Nollywood is one of the largest film industries on earth by volume.
Afrobeats stems, Nigerian-accented speech, Nigerian street photography,
Nigerian legal and medical text — all of it is currently harvested for free,
or bought for very little through data-labelling intermediaries who capture
nearly all the margin.

Ẹ̀rí becomes the **consent and provenance registry**: opt-in, revocable,
machine-readable licence declarations attached at deposit, collective
negotiation with buyers, and revenue shared back to the people whose work
is in the corpus.

This works *only* because the deposit layer already captured provenance and
identity at t=0. You cannot retrofit consent onto a scraped corpus. That is
the strategic point:

> **The vault's real purpose is provenance inventory for a market that does
> not exist yet.**

Governed with genuine community representation, published rates, and a
published ledger — or it becomes one more extraction with better branding.

---

## 7. What this cannot do

Stating these loudly is a feature. The history of "protect your invention"
services worldwide is largely a history of fraud against hopeful people, and
the distinguishing mark of the honest version is that it tells you when you
have nothing.

- **A deposit is evidence, not a right.** It does not create a patent, a
  trade mark, a registered design, or any monopoly.
- **Ideas are not protectable.** Nowhere, by anyone. Expression, inventions,
  marks, designs and secrets are. A deposited "idea for an app" is a dated
  file and nothing more, and the product must say so plainly at the moment
  of deposit rather than take the subscription quietly.
- **It cannot stop copying.** It changes what happens afterwards.
- **A timestamp proves you held a file.** It does not prove you originated
  the concept, and it does not prove the other party did not.
- **Registry filings still move at the registry's pace.** Ẹ̀rí can prepare,
  file, and track. It cannot make Abuja faster.
- **A Nigerian patent is granted without substantive examination** — as I
  understand the Patents and Designs Act, the Registrar checks formalities,
  not novelty or inventive step, so a granted Nigerian patent is held *at
  the risk of the patentee* and is only truly tested when litigated. This
  cuts both ways for the product: grants are cheap and fast to obtain, and
  they mean less than customers will assume. The interface must not let a
  customer believe a grant is a validation.

Every one of these belongs in the interface, not the FAQ.

---

## 8. The thing that kills it

Nigeria has a specific, earned, entirely reasonable distrust of
intermediaries who collect on behalf of creators. The long dispute over
which collecting society was properly approved, and the years of artists not
being paid by bodies that existed to pay them, is a live wound in every
Nigerian studio. Any new entity that stands between a creator and their
money starts underwater.

There is no way to talk your way out of that. The only answer is structural:

- **Client-side encryption.** The operator cannot read deposits. Hashes and
  metadata only. A vault holding the country's unreleased masters and
  unfiled inventions is a honeypot, and the encryption posture is
  existential rather than a feature.
- **A published, auditable payout ledger.** Every naira in and every naira
  out, per work, visible to the rights holder. Distrust is answered with
  arithmetic, not reassurance.
- **Never take ownership.** No equity in what it custodies, no exclusivity,
  ever. Non-exclusive by default. The moment it requires exclusivity it is a
  rights grab wearing a friendly name.
- **Structural separation** of custody, licensing, and credit. The arm that
  appraises an asset must not be the arm that lends against it or buys it.
- **Do not become the gatekeeper.** Data export must be free, complete, and
  one click, including on the way out the door.

And the regulatory posture, deliberately: **do not be a collecting society**
— be infrastructure that serves the approved one. **Do not take deposits** —
the moment advances look like banking or the royalty exchange looks like a
security, the CBN and SEC are correctly involved. Data handling sits under
the NDPA and the NDPC. Structure for this at incorporation, not after
traction.

---

## 9. Where to start

One thing, done perfectly, for one community.

**Phase 0 — Split sheets for Lagos studios. Free.**
Not the whole bank. Split sheets. It is the most painful, most universal,
best-understood failure in Nigerian creative life; every session already has
four to six people holding phones in one room; and each one must join to
sign, so distribution is structurally viral. Make the *producer* the hero —
producers are repeat players who host sessions and want their own credit
locked in, so they will bring the room.

Most importantly, it produces exactly the structured ownership data that
every later layer needs.

**Phase 1 — Receipts, and the first revenue.**
Disclosure rail for founders and SMEs. Clean Room seats sold to banks,
telcos, and VCs. This is where money starts.

**Phase 2 — Collection and settlement.**
DSP partnerships, automated splits, the transparent ledger. Then advances,
once there is a collection record to underwrite against.

**Phase 3 — NOTAP automation, the AI data collective, and credit.**

### Rough revenue shape

- Creators: free. Deposits and split sheets, permanently free.
- Startups/SMEs: subscription for receipts, filings, and monitoring.
- Corporates: Clean Room and defence seats — the largest line, by far.
- Mutual: annual premium.
- Marketplace: 10–15% on licences transacted.
- Collection/settlement: administration fee set deliberately below
  prevailing CMO rates, and published.
- Advances: discount rate on verified streams.
- Filings: fixed fee per NOTAP/registry action.

---

## 10. The honest risks

- **Adoption asymmetry.** The person who benefits most from a split sheet —
  the session musician — has the least power to insist on one. Mitigation is
  the producer-as-hero strategy above, but this is the central adoption risk
  and it should be tested in the first month, not assumed.
- **Trust.** Covered above. Assume every creator starts as a sceptic and has
  good reason to.
- **The honeypot.** A single breach ends the company and damages the people
  it exists to serve. Encryption posture is not negotiable.
- **Regulatory reclassification.** Advances and any fractional royalty
  product will attract CBN/SEC attention as they scale. Better to design for
  it early than to be surprised.
- **Becoming the thing.** An institution built to stop the powerful from
  taking from the powerless is, at sufficient scale, a powerful institution
  standing between creators and their money. The governance rules in §8 are
  not decoration; they are the reason it is allowed to exist.

---

## Needs a Nigerian IP lawyer's confirmation

I wrote this without live research. Treat every one of these as a question,
not a finding:

1. Third-party funding of arbitration under the Arbitration and Mediation
   Act 2023 — expressly permitted? This underpins the Mutual.
2. Current NOTAP royalty rate caps, duration limits, and which contract
   categories require registration.
3. Enforceability of a contractual evidential presumption of derivation, and
   its interaction with penalty doctrine.
4. Current status of Nigeria's Madrid Protocol position — accession versus
   domestication, and what that means in practice for filings designating
   Nigeria.
5. Which collecting society currently holds NCC approval, and on what terms
   a private platform may sit alongside it without requiring approval as a
   CMO itself.
6. The Nigeria Startup Act 2022 IP and commercialisation provisions, and
   whether labelled-startup status offers a usable route in.
7. Whether the Patents and Designs Act position on non-examination is as
   described in §7.
8. NDPA/NDPC obligations for a custodian holding biometric-linked identity
   alongside creative works.

---

## One paragraph, if that is all there is time for

Do not build a vault. Build the **rail that disclosure and creation have to
travel on**, capture ownership at the moment of creation when the truth is
still cheap to tell, and sell the receipts to both sides — the creator who
needs proof and the corporate who needs a defence. Custody is the loss
leader; the receipt is the asset; the mutual makes the receipt credible;
settlement makes the asset liquid; and the largest line in ten years is
collective licensing of Nigerian language, music, and film data to AI
developers, which is only possible if provenance was captured at deposit.
Start with free split sheets in Lagos studios, because that is the smallest
thing that produces the data everything else needs.

**The bank you use before there is any money.**
