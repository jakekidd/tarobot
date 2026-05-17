// Persona editor — placeholder. Will let Jade edit the seer's voice
// bible, the per-call prompts (intro / per-card / closing / chat), and
// the character cards (cassandra / mater tenebris / geometer).
//
// Routed under the Jade page router; BACK lives in the Jade topbar.

export function JadePersona() {
  return (
    <div className="jade-persona">
      <h2 className="jade-persona__title">persona editor</h2>
      <p className="jade-persona__lede">coming soon.</p>
      <p className="jade-persona__body">
        this is where you'll shape the seer — the voice bible (what makes her
        speak the way she does), the per-call prompts (intro / per-card /
        closing / chat), and the character cards (cassandra, mater tenebris,
        the geometer; different seers for different moods).
      </p>
      <p className="jade-persona__body">
        the survey editor is fully working — start there.
      </p>
    </div>
  );
}
