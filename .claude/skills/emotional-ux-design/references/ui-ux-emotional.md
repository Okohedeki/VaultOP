# UI/UX & Emotional Design — Plays

Plays that shape how the interface *feels* — interaction polish, delight, perceived performance, cognitive ease, and emotional response.

> Source: distilled from Bartek Marzec — *The Product Design Playbook* (@bartek_marzec).
> Plays are grouped by **primary discipline**; many apply across sections — follow each
> play's **Pair with** links to compose across disciplines.

---

## Micro Interactions

**Tagline:** Subtle feedback loops that make digital products feel tactile and alive.

**What it is:** Small, functional animations triggered by user actions — taps, swipes,
hovers, holds, or transitions — that reinforce the cause-and-effect loop of interaction.

**Why it works:** They confirm intent, reduce uncertainty, and inject life into the
interface. Done right, the product feels responsive, tactile, and thoughtfully built.

**When to use it:**
- On user actions: taps, clicks, drag & drop
- During transitions between states or screens
- On success, error, or confirmation moments
- As ambient feedback during navigation or loading

**Do:**
- Use micro-interactions to confirm the app is responding
- Add subtle animation to reinforce feedback loops and user flow
- Use haptics sparingly to enhance key moments
- Let users toggle haptics in settings for control and accessibility

**Don't:**
- Over-animate basic interactions — too much movement becomes noise
- Use animations that delay the experience or feel gimmicky
- Use complex sequences that slow down flow

**Founder Tip:** Small polish reads as premium quality — but only when used
intentionally. If your product doesn't feel alive and responsive, it feels broken.

**Pair with:** Permission Serve · Success Moments · Loading Feedback · Gamified Progress · Small Quirk

**Make it Yours:**
1. *High-impact touchpoints* — Where do users need reassurance their action was received? What moments feel static, cold, or uncertain? Where do users hesitate, wondering if the app is still working?
2. *Right interaction type* — Would a subtle nudge (vibration, bounce, shimmer) clarify what happened? How might you signal state change with motion instead of words? Visual, haptic, or both?
3. *Avoid overdoing it* — Where does motion get in the way of speed or clarity? Which animations feel playful but slow users down? What adds noise, not value?
4. *Brand and tone* — What does "responsive" look like for your brand (snappy, smooth, playful, minimal)? Could a signature micro-interaction become part of your identity?
5. *Test and evolve* — Where are users tapping twice or reloading (signs of no feedback)? How would a user describe the "feel" in one word? What's one interaction you could polish this week?

---

---

## Loading Feedback

**Tagline:** Reducing perceived wait time through smart feedback.

**What it is:** Custom loading states that replace dead spinners with character-rich
moments — animations, microcopy, or context-aware visuals that make waiting feel
intentional.

**Why it works:** Loading feedback distracts from delay, reinforces your brand voice,
and creates a moment of emotional connection. Users remember how it made them feel.

**When to use it:**
- Whenever operations take longer than ~100ms: page loads, file uploads, searches
- When fetching, generating, or uploading content
- In loops where users frequently return (dashboard refreshes, edits)

**Do:**
- Design the loading state as a branded, ownable surface
- Match the feedback to the task (e.g. photos stacking when building an album)
- Use personality-driven microcopy or visuals for a delightful moment

**Don't:**
- Leave screens blank or frozen
- Use vague messages like "Please wait…" without context
- Show generic, poorly matched spinners or loading bars

**Founder Tip:** Every product has friction; the best ones make it feel worthwhile.
Don't just explain the wait — use it to express your brand's tone of voice and personality.

**Pair with:** Micro Interactions · Success Moments · Perceived Effort Delay · JTBD Copywriting

**Make it Yours:**
1. *Where feedback is missing* — Where do users wait (loading, uploading, syncing, generating)? Which screens freeze or feel static? What's the longest delay and how does it feel?
2. *Emotional context* — What are users feeling while they wait (anticipation, frustration, boredom)? How might you surprise or reward them? Could humour/charm/brand be embedded?
3. *Design with purpose* — What metaphor, animation, or microcopy feels native to the task? Can you reinforce trust or teach something? Could the loading state feel like a feature, not filler?
4. *Match tone and task* — Quick and snappy, or calm and reassuring? How would the product "speak" during a delay? Could a visual mirror progress?
5. *Refine and test* — Do users abandon during long waits? Are they complaining of "slowness"? If you removed the feedback, what would feel broken?

---

---

## Success Moments

**Tagline:** Rewarding users immediately after completing a key action.

**What it is:** Short, uplifting moments triggered by meaningful actions — a completed
task, milestone, or step — designed to pause the flow, acknowledge progress, and
emotionally reward.

**Why it works:** Our brains crave feedback loops. A well-timed success moment delivers
validation, breaks up heavy flows, and fuels motivation. Positive reinforcement builds
habits.

**When to use it:**
- During onboarding to mark checkpoints (25%, 50%, 75%)
- After high-effort tasks or as momentum boosters in dull flows
- Before asking for feedback, referrals, or permission

**Do:**
- Use celebratory micro-interactions, brand flourishes, or warm copy
- Acknowledge effort, not just outcome
- Keep the moment short but emotionally charged

**Don't:**
- Overuse or fake it — only celebrate real progress
- Disrupt flow with long animations or loud effects
- Skip these moments in high-friction experiences

**Founder Tip:** Use success moments sparingly — they should feel earned, not expected.
Success is momentum: nail the timing and feeling, and users are receptive to what comes next.

**Pair with:** Micro Interactions · Loading Feedback · Gamified Progress · Permission Serve · Referral · Shareability · Value Replay

**Make it Yours:**
1. *When to mark success* — What tasks require real effort? Where do users reach a moment deserving acknowledgment that gets none? What steps feel like emotional "wins"?
2. *Emotional tone* — What emotion should users feel (relief, pride, joy, encouragement)? How to match it with animation, copy, or sound? A signature celebration tone?
3. *Avoid fatigue* — Are you rewarding too often/early and diluting impact? Does it feel earned or like a participation trophy? Are you interrupting users who want to stay in motion?
4. *Make it meaningful* — Acknowledge effort, not just result? Reinforce progress with a nudge toward what's next? Is the next best action guided clearly?
5. *Refine and evolve* — Where are users most likely to churn — could a success moment re-engage them? What feedback/silence follows key actions? If stripped away, would the product feel less alive?

---

---

## Perceived Effort Delay

**Tagline:** Increasing perceived value with a timely pause.

**What it is:** A deliberate pause or processing moment that signals care, personalisation,
or depth. When outcomes are delivered too fast, we may question their authenticity or value.

**Why it works:** Intentional delay reframes the result as considered, tailored, or
important. Our brains link time with effort — when things take longer, we think more
care went into them.

**When to use it:**
- When delivering a result, recommendation, or score
- When simulating intelligent processing ("thinking", "analysing", "personalising")
- When your app offers insight/feedback/predictions and you want them to feel premium
- When users expect emotional weight (mental health, finance)
- When too-fast responses risk feeling generic or automated and reduce trust

**Do:**
- Use progress animations or copy like "Analysing your input", "Curating your best match"
- Frame the delay with clear intent — it should feel like something worthwhile is happening
- Keep the wait just long enough to feel meaningful for the results you retrieve

**Don't:**
- Make users wait unnecessarily — it's about the illusion of depth, not friction
- Use generic spinners with no narrative — always frame the pause with purpose
- Overuse the play — constant delays frustrate and erode trust

**Founder Tip:** Speed feels cheap when the user expects effort. A deliberate pause
suggests care and personalisation. It's not lag — it's luxury.

**Pair with:** Loading Feedback · Intentional Friction · Gamified Progress · Time to Value

**Make it Yours:**
1. *When to pause* — Is the result personal/calculated/important? Could a brief delay make it more trustworthy/high-value? What moment deserves suspense or thoughtfulness?
2. *Frame with meaning* — Explain the pause with copy ("Finding your best match…")? What visual signals care without blocking? Does the delay match tone (calm for health, precise for finance)?
3. *Calibrate timing* — Would 1–3 seconds feel purposeful or slow? Adapt to content complexity? What's the emotional goal (trust, anticipation, significance)?
4. *Avoid false friction* — Are users waiting for no reason? Could it backfire if repeated? Empty spinners vs narrative moments?
5. *Test perception* — Do users trust the result more after a thoughtful delay? How do retention/satisfaction change? Are people calling it "smart," "thorough," "considered"?

---

---

## Small Quirk

**Tagline:** Signature moments that turn utility into identity.

**What it is:** A distinctive interaction, animation, UI flourish, or pattern that adds
personality to repeated product moments — your product's accent: subtle but memorable.

**Why it works:** Users form emotional attachments to distinctive patterns. Done right, a
small quirk becomes a signature — increasing brand recall, delight, and perceived polish
without harming clarity.

**When to use it:**
- On repeatable actions that anchor the core experience
- When you want to break product sameness or category fatigue
- After clarity is nailed and you want to layer personality without harming usability

**Do:**
- Tie the quirk to your product's brand, tone, or core philosophy
- Use it in recurring moments so it becomes a familiar, ownable pattern
- Keep it light, intuitive, and non-blocking

**Don't:**
- Force quirk into high-stakes, high-friction UX (checkout, account recovery)
- Prioritise novelty over clarity — delight shouldn't require learning
- Break platform conventions without strong justification

**Founder Tip:** Your app's quirk is a signature. When users recognise it as yours,
you've built something sticky. Own a small behaviour and you own a piece of memory.

**Pair with:** Micro Interactions · JTBD Copywriting · Pattern Alignment · Intentional Friction

**Make it Yours:**
1. *Right moment* — Where do users repeat an action often (swipe, search, tap)? What feels too generic/industry-standard? Clarity nailed — safe to add personality?
2. *Shape the quirk* — Tie it to brand tone or story? Happens often enough to become familiar? Will users "get it" without explanation?
3. *Check the balance* — Adding delight without confusion? Still works if the user missed the flourish? Playful in low-stakes, not critical flows?
4. *Make it ownable* — Could this be something only your product does? Reuse the pattern across the app? Would a new user remember it after one try?

---

---

## Empty States

**Tagline:** Turning blank screens into activation opportunities.

**What it is:** Empty states appear when there's no content to show yet. Instead of
leaving users stranded, they're your chance to guide, inspire, and onboard.

**Why it works:** A blank screen is a dead end. A clear, helpful empty state nudges
action, sets expectations, and turns nothing into momentum — often a first impression.

**When to use it:**
- When a page would otherwise be blank: after signup, first use, or clearing content
- When filters or search return no results
- During onboarding flows where input is expected

**Do:**
- Add a short headline & helpful microcopy explaining what to do next
- Show what "good" looks like — illustrations, examples, or demos
- Align tone with your brand voice — friendly, clear, never robotic

**Don't:**
- Leave the screen empty or cryptic ("No items found." is not enough)
- Assume users know what to do without instruction
- Make empty states static — they should be a prompt, not a placeholder

**Founder Tip:** Every empty state is a chance to teach, inspire, and build trust.
The first click forward starts here — a great empty state can trigger activation.

**Pair with:** JTBD Copywriting · Setup Defaults · Time to Value · Progressive Disclosure · Discovery

**Make it Yours:**
1. *Where empty states exist* — Which screens show "nothing" on first arrival? What happens when filters/searches return nothing? Does onboarding assume input before anything appears?
2. *Frame the opportunity* — What action do you want here? What fear/doubt might the user have? What first impression are you leaving?
3. *Design with clarity* — What's the one message users need to act now? Can you show a visual cue or example of "good"? Can you teach through the UI instead of tooltips/docs?
4. *Brand and flow* — What tone fits (instructional, playful, confident)? Could the screen reflect your core value immediately? Could the empty state feel like progress, not a void?
5. *Evolve and test* — Are users bouncing or taking the next step? What support requests come from users stuck here? Could a revised empty state lift conversion/onboarding?

---

---

## Variable Reward

**Tagline:** Inject just the right amount of unpredictability to create return behaviour.

**What it is:** A feedback loop that introduces light unpredictability into a familiar
flow — adding novelty to drive engagement without changing the core mechanics.

**Why it works:** Predictable is efficient; unpredictable is addictive. When users expect
something slightly different each time, anticipation kicks in — boosting dopamine and
bringing people back to see what's new.

**When to use it:**
- To reward exploration, curiosity, or creative output
- When your product's outputs are dynamic (AI, suggestions, discovery, content)
- To break monotony without changing structure (new visuals, tips, bonuses)

**Do:**
- Make the randomness feel rewarding, not arbitrary
- Use in flows where outcomes aren't mission-critical
- Highlight differences visually (badges, colours, rare finds, rotating tips)

**Don't:**
- Add randomness where users expect control or reliability
- Hide important functionality behind randomness
- Create loops that feel addictive without purpose — it breaks trust

**Founder Tip:** Variable reward is behavioural UX, but value must always win over chance.
A tiny twist makes users lean in. Keep the core familiar; let the surprise live in the edges.

**Pair with:** Micro Interactions · Intentional Friction · Referral · Spark Curiosity · Discovery

**Make it Yours:**
1. *Right moment* — Which core actions become repetitive over time? Where does exploration/play already exist? Do you have dynamic outputs (AI, suggestions, generated content)?
2. *Design the loop* — What feels like a "prize" without high stakes? Frame randomness as delight ("What you might like next…")? Result still useful even if unpredictable?
3. *Avoid manipulation* — Are users gaining value or just chasing novelty? Would it still work without the surprise? Can users opt out or skip?
4. *Make it memorable* — Visual/emotional/playful enough to matter? Could users share the outcome? Does it reinforce a habit you want to strengthen?

---

---

## Spark Curiosity

**Tagline:** Creating tension between the user, product, and the outcome.

**What it is:** A tactic that reveals just enough to activate intrigue, withholding the
rest until users take action. It turns product flows into story arcs, where curiosity is
the driver.

**Why it works:** We're wired to resolve gaps in knowledge. When we glimpse something
meaningful but incomplete, our brains itch to resolve it — tapping anticipation and
emotional tension.

**When to use it:**
- Flows where anticipation amplifies perceived value (quiz results, dating matches)
- When a feature/insight feels valuable but requires effort or upgrade to unlock
- To tease social status, usage data, or gamified outcomes without full reveal

**Do:**
- Blur, mask, or hide just enough to spark interest ("You have 3 new messages")
- Use emotionally charged copy to frame the mystery ("Someone liked your profile")
- Consider timed reveals or sneak previews to build tension

**Don't:**
- Overuse it — curiosity only works if the reward feels meaningful
- Create artificial walls that frustrate instead of intrigue
- Leave users in limbo with no clear way to resolve the curiosity

**Founder Tip:** Use it to create pull, not frustration. The best reveals feel earned,
not extracted. Design suspense with a payoff — trigger meaningful action through mystery.

**Pair with:** Intentional Friction · The Paywall · Variable Reward · Limited Offer · Success Moments

**Make it Yours:**
1. *Frame the tease* — What value/insight are you partially revealing? How to blur/count down/conceal just enough? Guiding toward the payoff or teasing without clarity?
2. *Create meaning* — Is the hidden outcome worth discovering? Does copy build tension (pride, progress, exclusivity)? Link the mystery to a goal (complete task → unlock result)?
3. *Control timing* — Would a delayed reveal heighten anticipation? Curiosity as a bridge to engagement, not a dead end? Resolve the mystery quickly enough to satisfy?

---

---

## Pattern Alignment

**Tagline:** The familiarity of interactions, flows, and behaviours understood by users.

**What it is:** Designing interactions that follow familiar patterns from other tools,
apps, or platforms your users already trust. Tap their muscle memory so they instantly
"get it" without learning.

**Why it works:** People don't think about using good interfaces — they just move. When
your product reflects their mental models, it feels obvious, fast, and safe. Familiarity
lowers cognitive load, speeds adoption, and builds confidence from the first click.

**When to use it:**
- During onboarding or first-use experiences
- When introducing new interaction types or UI layouts
- For products targeting users switching from legacy systems or popular tools

**Do:**
- Use platform conventions (swipes, tabs, gestures) where they make sense
- Prioritise speed-to-comprehension over novelty
- Borrow from familiar interfaces where expectations are already shaped

**Don't:**
- Reinvent patterns just to be different
- Introduce friction where intuition should carry the user
- Mix too many models — pick one mental map and commit

**Founder Tip:** You don't need to train your user if you meet them where they already
are. Good alignment is invisible design. Start with the familiar, then gradually introduce
what's new once trust is earned.

**Pair with:** Loading Feedback · Personalisation · JTBD Copywriting · Progressive Disclosure · Small Quirk · Value Replay

**Make it Yours:**
1. *Uncover mental models* — What similar products shaped user expectations? How would users expect this to behave? Are you asking them to unlearn something?
2. *Reduce onboarding friction* — Match known UI patterns from trusted tools? Terms/icons/flows familiar or forcing interpretation? What makes the first session instantly usable?
3. *When (and how) to break patterns* — Breaking a mental model for a good reason or just to differ? Do users understand why? Can you explain the value clearly?
4. *Align feedback and tone* — Plain, goal-oriented language? Celebrate progress in a human, not robotic, way? Can users see how actions connect to goals?
5. *Test and validate* — Where do users pause/hesitate/tap the wrong thing? Which steps feel obvious vs create drop-off? Do users say "clear," "fast," "intuitive"?

---

## Progressive Disclosure

**Tagline:** Phased unravelling of information, layers, and product complexity.

**What it is:** A sequencing technique that prioritises clarity — show only what matters
now and unlock deeper layers as the user grows ready, confident, or curious.

**Why it works:** Reduces anxiety, helps focus, and increases comprehension. By respecting
mental bandwidth, it makes the app feel simpler without making it less powerful.

**When to use it:**
- When the product needs content creation, detailed setup, or customisation
- When user skill or readiness varies widely
- When onboarding into a multi-layered product with advanced capabilities

**Do:**
- Let experienced users skip ahead while giving beginners guardrails
- Stage complexity in parallel with user confidence or time-on-task
- Decide which features the initial disclosure level should contain

**Don't:**
- Force multi-step flows when one step would suffice
- Make users hunt or guess how to access deeper functionality
- Over-engineer paths — sequencing should feel invisible

**Founder Tip:** Your product may be deep, but it shouldn't feel overwhelming. Pace what
you reveal, layer context, and let users grow into your product rather than bounce off it.

**Pair with:** Time to Value · Intentional Friction · Loading Feedback · Investment · Personalisation · Intent Mirroring · Momentum Bias

**Make it Yours:**
1. *What to disclose first* — What must a first-timer see/do? Which features can wait until intent/readiness shows? What's the minimum useful version of this screen?
2. *Guide the reveal* — Where do users get overwhelmed/drop off? Clear signs they're ready for more? Use time-on-task or prior choices to unlock next steps?
3. *Simplicity vs power* — Could experienced users jump ahead without penalty? Layering depth naturally, not a maze? Advanced options hidden but accessible?
4. *Seamless progression* — Does each layer feel like progress or load? Using UI affordances to signal what's new? A "just-in-time" reveal for deeper features?
5. *Validate* — Are users asking where things are or discovering organically? Forcing steps that don't match confidence? Flexible for fast and slow learners?

---

