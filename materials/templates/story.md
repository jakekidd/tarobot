# Story

This is a reference doc for human editors. The engine uses the typed
`StoryObject` shape defined in `src/pipeline/survey/types.ts`. The
detective populates this incrementally across the survey; at end-of-
survey it hands off to the seer alongside profile + investigation.

The story is the narrative cross-section across time, anchored to the
user's live fork. Its slots map directly to card positions in the
4-card diamond:

```
past_root        →  past card     (top)
present_pressure →  present card  (left or right depending on spread)
fork.A           →  future card A (left or right)
fork.B           →  future card B (the other)
```

## fork

The two future paths. May be **stated** (user named it on the intent
opener and the survey confirmed) or **constructed** (built by the
detective from picks). When no clear fork emerges, the stasis-as-fork
fallback fires:

```
fork.a = "act on this"
fork.b = "continue as you are"
is_stasis = true
```

Shape:

- `a` — one branch, short specific phrase
- `b` — the other branch, short specific phrase
- `is_stasis` — true iff this is the fallback construction

## present_pressure

What in the user's current life makes the fork acute — the unbearable
thing. In the user's own words where possible. One short paragraph.

## past_root

What in the user's history pre-figures the fork — the unresolved, the
regret, the formative pattern. Where the seer's past card lands. One
short paragraph.

## stakes

What is at risk on each path:

- `on_a` — what gets lost / gained if branch A
- `on_b` — what gets lost / gained if branch B

Two short paragraphs. Stakes do NOT advocate for one path; both
should read with equal weight.

## hooks

Verbatim concrete specifics the seer can echo back — names, places,
sensory details, phrases the user used. Specificity is the
difference between uncanny and generic. The seer drops these into
beats to make the user feel x-rayed.

Example hooks:
- "drove past the old high school last week"
- "dad's hands smelled like gasoline"
- "the apartment has a chair you can't sit in"
