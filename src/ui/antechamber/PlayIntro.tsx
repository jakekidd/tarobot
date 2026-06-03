// PlayIntro — the beat before the first guess. The turtle's line is in the
// dialogue above; this is the choice surface: a disabled "name it" field
// (a forward-hook for the eventual vent path) and the shiny, breathing
// PLAY button that drops the user into the guessing game.

type Props = { onPlay: () => void };

export function PlayIntro({ onPlay }: Props) {
  return (
    <div className="play-intro">
      <input
        type="text"
        className="play-intro__field"
        placeholder="name it, if you already know…"
        disabled
        aria-hidden
      />
      <button type="button" className="play-intro__button" onClick={onPlay}>
        <span className="play-intro__text">play</span>
      </button>
    </div>
  );
}
