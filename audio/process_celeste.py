#!/usr/bin/env python3
"""Process the celeste recording into a lo-fi "far across the field"
ambience layer that sits under the kalimba in the menu.

Compared to the kalimba treatment, this one is more spacious and dirtier:
the celeste needs to keep enough of its bell character to be recognizable,
but with tape-style wobble and very long reverb tails so it feels like
it's coming from someplace else entirely. The kalimba is "two rooms over"
— the celeste is "across the parking lot, through a tape machine."

The chain:
  1. trim     — 75s slice (coprime with the kalimba's 90s loop, so the
                two layers drift in and out of phase ~every 13 min)
  2. gain     — small reduction (input is already not hot)
  3. highpass 80 Hz   — remove dc / rumble
  4. lowpass 2800 Hz  — soft roll-off; keep enough sparkle for bell
                        character to read, lose the brittle top
  5. vibrato 2.3 Hz @ 0.04 depth — slow tape wobble. Subtle enough not
                                   to read as effect, just feels old.
  6. aecho (5-tap)    — dense early reflections, this is most of the
                        reverb sound. Out-gain 0.9 keeps taps audible.
  7. aecho (2-tap)    — long late tail (2200ms, 2900ms) — the "across
                        the field" length. Low decay so it doesn't pile.
  8. lowpass 2400 Hz  — smear the reverb tail's high content further
                        (real reverb in a large space loses highs fast)
  9. loudnorm I=-30   — quieter than the kalimba layer (I=-28). It sits
                        BELOW the kalimba in the mix.
  10. fades + encode mp3 @ 96k

Source: /Users/jakek/Code/celeste.m4a (224s mono 48kHz aac)
Output: /Users/jakek/Code/tarobot/public/audio/celeste-distant.mp3

Usage: python3 audio/process_celeste.py
"""

import subprocess
import sys
from pathlib import Path

SRC = Path("/Users/jakek/Code/celeste.m4a")
OUT = Path("/Users/jakek/Code/tarobot/public/audio/celeste-distant.mp3")

# Trim window: middle slice. The source is 224s; skip the first 10s in
# case there's an awkward start, take 75s.
START_SEC = 10
DURATION_SEC = 75


def build_filter_chain() -> str:
    """Return the ffmpeg -af filter string."""
    fade_out_start = DURATION_SEC - 2.0
    return ",".join([
        "volume=0.55",
        "highpass=f=80",
        "lowpass=f=2800",
        "vibrato=f=2.3:d=0.04",
        # 5-tap dense early reflections — this is most of the room sound.
        "aecho=0.85:0.9:120|260|520|900|1400:0.5|0.4|0.3|0.22|0.14",
        # 2-tap long-tail reverb — the "across the field" length.
        "aecho=0.6:0.7:2200|2900:0.18|0.1",
        # Smear the high content of the reverb tail.
        "lowpass=f=2400",
        # Quieter than the kalimba layer. Ambient bed sits ~6 LUFS below.
        "loudnorm=I=-30:LRA=11:TP=-3",
        "afade=t=in:st=0:d=2.0",
        f"afade=t=out:st={fade_out_start:.2f}:d=2.0",
    ])


def main() -> int:
    if not SRC.exists():
        print(f"error: source not found at {SRC}", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(START_SEC),
        "-i", str(SRC),
        "-t", str(DURATION_SEC),
        "-af", build_filter_chain(),
        "-ac", "1",
        "-c:a", "libmp3lame",
        "-b:a", "96k",
        str(OUT),
    ]
    print("running:", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("--- ffmpeg stderr ---", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return result.returncode

    size_kb = OUT.stat().st_size / 1024
    print(f"\nok: wrote {OUT} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
