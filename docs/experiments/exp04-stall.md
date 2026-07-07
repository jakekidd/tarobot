# exp04 — stall stress: does the brake ever get used? (2026-07-07)

**Question.** Seven recorded normal sessions had zero stalls. Is that
because cognition is always fresh in harness conditions, or because the
driver never elects the brake at all?

**Method.** Chat mode, heavy scripted track, fan thresholds set
unreachable (`FAN_MIN_NEW_WORDS=99999`, `FAN_BACKSTOP_TURNS=99999`) so
the tails stay permanently empty. The stall's own force-fire still
works — one stall would have refilled cognition, exactly the designed
escape valve. `pnpm exp:stall`.

**Result.** Zero stalls. The driver ran the entire session on raw beats
plus the frame, never once reached for the brake — and the transcript
was still good ("did someone ask you to. or did you just start." with
completely empty tails).

**Two readings, both recorded:**

1. The mechanical one: staleness was invisible. `STALL_STATE:
   available` says nothing about WHY you'd stall. Fixed: the driver now
   sees "note: cognition has NOT digested the newest visitor material
   yet" whenever the newest visitor beat post-dates the last filed
   read. Re-test under real typing cadence (harness settles wait for
   the fan, so the note rarely fires in scripted runs — it exists for
   live use and slow local models).
2. The uncomfortable one: a Sonnet-class driver on raw transcript alone
   is close to self-sufficient on short sessions. This is a data point
   FOR the naive arm and against the fan's per-beat value. The fan's
   case must rest on what raw-context cannot do: compounding memory
   over long sessions (exp07), the psychic's verbatim ammo (exp06), and
   attention's card-dressing (observed working in exp01). If those
   don't measure out, the honest ensemble is smaller than designed.

**Verdict.** Stall stays (it is cheap and its real target — slow local
models at the booth, fast-typing visitors — is not reproducible in this
harness), but it is unproven. Gate for further stall investment: a live
lab session where the staleness note actually appears and the driver
uses it.
