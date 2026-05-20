#!/usr/bin/env python3
"""Process the loud-and-close kalimba recording into "2 rooms over"
ambience for the menu screen.

The chain:
  1. trim   — cut to a clean loop section (skip any noisy intro/outro)
  2. gain   — drop input volume so loudnorm has headroom
  3. high-pass 100 Hz   — kill subwoofer rumble, mic handling thumps
  4. low-pass 700 Hz    — walls absorb high frequencies; this is the
                          biggest single ingredient of the "distant" feel
  5. aecho (multi-tap)  — fake reverb tail simulating room reflections
  6. loudnorm           — even out the wandering player dynamics so the
                          loud notes don't poke through and ruin the
                          ambient illusion
  7. final gain         — overall level for menu-background use (quiet)
  8. fade in/out        — clean loop boundaries so seamless looping
                          doesn't click
  9. encode mp3 @ 96k   — small file, web-friendly

Source: /Users/jakek/Code/kalimba.m4a (175s mono 48kHz aac)
Output: /Users/jakek/Code/tarobot/public/audio/kalimba-distant.mp3

Usage: python3 audio/process_kalimba.py
"""

import os
import subprocess
import sys
from pathlib import Path

SRC = Path("/Users/jakek/Code/kalimba.m4a")
OUT = Path("/Users/jakek/Code/tarobot/public/audio/kalimba-distant.mp3")

# Trim window: pick a 90-second middle section so the file is loopable
# without burning a 3-minute asset. The recording is 175s — start at 0
# is fine since there's no clear intro/outro; we just want a chunk that
# stays musical the whole way.
START_SEC = 5
DURATION_SEC = 90


def build_filter_chain() -> str:
    """Return the ffmpeg -af filter string. Tuned for 'further away' than v1:
    lower lowpass (more wall absorption), longer reverb tail, quieter overall.
    """
    fade_out_start = DURATION_SEC - 1.5
    return ",".join([
        "volume=0.35",
        "highpass=f=100",
        # 500Hz cutoff — even more wall-muffled than v1's 700Hz. Kalimba's
        # transients are gone, only low harmonic body remains.
        "lowpass=f=500",
        # 5-tap echo with longer late tap (820ms) — sounds like the source
        # is across a bigger room, not just two walls away.
        "aecho=0.78:0.86:80|180|360|580|820:0.4|0.3|0.22|0.14|0.08",
        # Smear the reverb tail's high content again so the wet signal is
        # even less detailed than the dry.
        "lowpass=f=400",
        # I=-32 LUFS — 4dB quieter than v1. Sits well below dialogue.
        "loudnorm=I=-32:LRA=11:TP=-3",
        "afade=t=in:st=0:d=1.0",
        f"afade=t=out:st={fade_out_start:.2f}:d=1.5",
    ])


def main() -> int:
    if not SRC.exists():
        print(f"error: source not found at {SRC}", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",                              # overwrite output
        "-ss", str(START_SEC),
        "-i", str(SRC),
        "-t", str(DURATION_SEC),
        "-af", build_filter_chain(),
        "-ac", "1",                        # stay mono — distant kalimba
                                           # doesn't need stereo and saves bytes
        "-c:a", "libmp3lame",
        "-b:a", "96k",                     # plenty for muffled low-mid content
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
