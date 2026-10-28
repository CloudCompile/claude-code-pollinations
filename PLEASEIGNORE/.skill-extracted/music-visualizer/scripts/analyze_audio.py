#!/usr/bin/env python3
"""
analyze_audio.py - turn a song into a choreography sheet for Remotion.

Usage:
    python3 analyze_audio.py song.mp3 --fps 60 --out public/analysis.json
    python3 analyze_audio.py song.mp3 --fps 60 --out public/analysis.json --plot debug.png

Needs: numpy, scipy, ffmpeg on PATH (matplotlib only for --plot).
No librosa on purpose, so it runs anywhere the skill does.

Output (all frame numbers are at --fps, floats allowed for sub-frame accuracy):
{
  "fps", "duration", "durationInFrames",
  "bpm", "beatOffset",            # seconds to first beat
  "beats":     [frame, ...],      # beat grid
  "downbeats": [frame, ...],      # every bar start (best-guess phase)
  "bands": {name: [0..1 per frame]},   # per-band level, normalized per band
  "env":   {name: [0..1 per frame]},   # instant attack, band-specific release
  "slow":  {name: [0..1 per frame]},   # same signal, ~0.5 s low-pass, for drifting things
  "events": {"kick": [{"f","s"}], "snare": [...], "hat": [...], "any": [...]},
  "sections": [{"start","end","intensity","role"}],  # frames; roles are hints
  "energy": [0..1 per frame]      # overall loudness, normalized
}
"""
import argparse, json, subprocess, sys, tempfile, os
import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import median_filter, uniform_filter1d

SR = 22050
N_FFT = 2048
HOP = 256  # ~11.6 ms; finer than any video frame

# name: (lo Hz, hi Hz, release seconds)
BANDS = {
    "sub":     (20, 60, 0.20),
    "bass":    (60, 250, 0.16),
    "lowmid":  (250, 500, 0.12),
    "mid":     (500, 2000, 0.10),
    "highmid": (2000, 6000, 0.08),
    "air":     (6000, 11000, 0.06),
}


def decode(path):
    tmp = tempfile.mktemp(suffix=".wav")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", path, "-vn", "-ac", "1",
           "-ar", str(SR), tmp]
    subprocess.run(cmd, check=True)
    sr, x = wavfile.read(tmp)
    os.remove(tmp)
    x = x.astype(np.float32)
    if x.dtype.kind == "i" or np.abs(x).max() > 1.5:
        x /= 32768.0
    return x


def band_log_energy(M, freqs):
    """Mean power per band per STFT hop, in dB."""
    out = {}
    for name, (lo, hi, _) in BANDS.items():
        idx = (freqs >= lo) & (freqs < hi)
        p = (M[idx] ** 2).mean(axis=0)
        out[name] = 10 * np.log10(p + 1e-10)
    return out


def normalize_db(db, lo_pct=8, hi_pct=99.5, gamma=1.6):
    """Per-band normalization so highs matter as much as bass.
    gamma > 1 pushes quiet passages toward a true zero (contrast)."""
    lo, hi = np.percentile(db, [lo_pct, hi_pct])
    v = np.clip((db - lo) / max(hi - lo, 1e-6), 0, 1)
    return v ** gamma


def to_frames(curve_hop, hop_rate, fps, n_frames, how="max"):
    """Resample a per-hop curve to per-video-frame. 'max' keeps transients."""
    out = np.zeros(n_frames, dtype=np.float32)
    per = hop_rate / fps
    for i in range(n_frames):
        a = int(i * per)
        b = max(int((i + 1) * per), a + 1)
        seg = curve_hop[a:b] if a < len(curve_hop) else curve_hop[-1:]
        out[i] = seg.max() if how == "max" else seg.mean()
    return out


def attack_release(v, fps, release_s):
    """Instant attack, exponential release: the Geometry Dash pulse shape."""
    coef = np.exp(-1.0 / (fps * release_s))
    out = np.zeros_like(v)
    prev = 0.0
    for i, x in enumerate(v):
        prev = max(x, prev * coef)
        out[i] = prev
    return out


def one_pole(v, fps, tau_s):
    a = np.exp(-1.0 / (fps * tau_s))
    out = np.zeros_like(v)
    prev = 0.0
    for i, x in enumerate(v):
        prev = a * prev + (1 - a) * x
        out[i] = prev
    return out


def flux_of(logE_norm):
    d = np.diff(logE_norm, prepend=logE_norm[0])
    return np.maximum(d, 0)


def pick_events(flux_hop, hop_rate, fps, min_gap_s, level_hop=None, min_level=0.0,
                k=1.6, window_s=0.6):
    """Adaptive-threshold peak picking. Returns [{f, s}] with s in 0..1.
    level_hop/min_level: the band must be genuinely LOUD at the peak. Without this, a
    near-silent band gets its leakage normalized up and fires phantom events
    (e.g. hats registering as kicks in an intro with no kick)."""
    f = uniform_filter1d(flux_hop, size=3)
    w = max(int(window_s * hop_rate) | 1, 3)
    med = median_filter(f, size=w, mode="nearest")
    mad = median_filter(np.abs(f - med), size=w, mode="nearest")
    thr = med + k * (mad + 1e-4)
    peaks, props = signal.find_peaks(f, height=thr, distance=max(int(min_gap_s * hop_rate), 1))
    if level_hop is not None and len(peaks):
        # level just after the onset (flux peaks at the rise, the band is loudest a few hops later)
        lv = np.array([level_hop[p:p + 6].max() for p in peaks])
        peaks = peaks[lv >= min_level]
    if len(peaks) == 0:
        return []
    h = f[peaks]
    scale = np.percentile(h, 95) + 1e-9
    s = np.clip(h / scale, 0, 1.0)
    return [{"f": round(float(p / hop_rate * fps), 2), "s": round(float(si), 3)}
            for p, si in zip(peaks, s) if si > 0.12]


def estimate_beat_grid(onset_hop, hop_rate, kick_hop, duration, bpm_hint=None):
    """Tempo by autocorrelation (or --bpm hint), then a fine grid search over bpm and phase."""
    e = onset_hop - onset_hop.mean()
    ac = np.correlate(e, e, "full")[len(e) - 1:]
    lo = int(hop_rate * 60 / 190)
    hi = int(hop_rate * 60 / 70)
    lag = lo + int(np.argmax(ac[lo:hi]))
    bpm0 = 60 * hop_rate / lag
    while bpm0 < 85:
        bpm0 *= 2
    while bpm0 > 175:
        bpm0 /= 2
    if bpm_hint:
        bpm0 = float(bpm_hint)

    t = np.arange(len(onset_hop)) / hop_rate
    best = (-1, bpm0, 0.0)
    for bpm in np.arange(bpm0 * 0.97, bpm0 * 1.03, 0.05):
        period = 60.0 / bpm
        for off in np.arange(0, period, 0.01):
            pts = np.arange(off, duration, period)
            score = np.interp(pts, t, onset_hop).sum() / max(len(pts), 1)
            if score > best[0]:
                best = (score, bpm, off)
    _, bpm, off = best
    period = 60.0 / bpm
    beats = np.arange(off, duration, period)

    # downbeat phase: which of 4 positions carries the most kick energy
    sums = [np.interp(beats[p::4], t, kick_hop).sum() for p in range(4)]
    phase = int(np.argmax(sums))
    return bpm, off, beats, beats[phase::4]


def find_sections(total_level, onset_density, bar_frames, fps, n_frames, min_bars=4):
    """Bar-wise novelty with a checkerboard kernel. Hints, not gospel.
    bar_frames: frame number of each bar start (downbeats)."""
    bar_frames = np.array(bar_frames, dtype=float)
    if len(bar_frames) < 8:
        return [{"start": 0, "end": n_frames, "intensity": 0.5, "role": "groove"}]
    edges = np.r_[bar_frames, n_frames]
    feats = []
    for a, b in zip(edges[:-1], edges[1:]):
        a, b = int(a), int(min(b, n_frames))
        if b <= a:
            continue
        feats.append([total_level[a:b].mean(), onset_density[a:b].mean()])
    F = np.array(feats)
    Z = (F - F.mean(0)) / (F.std(0) + 1e-6)
    S = Z @ Z.T
    L = 4
    k = np.ones((2 * L, 2 * L))
    k[:L, L:] = -1
    k[L:, :L] = -1
    nov = np.zeros(len(Z))
    for i in range(L, len(Z) - L):
        nov[i] = (S[i - L:i + L, i - L:i + L] * k).sum()
    peaks, _ = signal.find_peaks(nov, height=np.percentile(nov[L:-L], 70) if len(nov) > 2 * L else 0,
                                 distance=min_bars)
    cuts = [0] + [int(edges[p]) for p in peaks] + [n_frames]
    cuts = sorted(set(cuts))

    inten = F[:, 0] * 0.6 + F[:, 1] * 0.4
    inten = (inten - inten.min()) / (np.ptp(inten) + 1e-6)

    sections = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        bars = [j for j, e in enumerate(edges[:-1]) if a <= e < b]
        val = float(np.mean(inten[bars])) if bars else 0.5
        sections.append({"start": a, "end": b, "intensity": round(val, 3)})
    for i, s in enumerate(sections):
        nxt = sections[i + 1]["intensity"] if i + 1 < len(sections) else s["intensity"]
        if s["intensity"] < 0.3:
            s["role"] = "build" if nxt - s["intensity"] > 0.25 else "calm"
        elif s["intensity"] > 0.65:
            s["role"] = "drop"
        else:
            s["role"] = "groove"
    return sections


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--out", default="analysis.json")
    ap.add_argument("--plot", default=None, help="write a debug PNG")
    ap.add_argument("--bpm", type=float, default=None,
                    help="known tempo. Strongly recommended if you know it: autodetect can be "
                         "off by ratios like 2:3 or 2x. The grid is refined within +-3%% of it.")
    a = ap.parse_args()

    x = decode(a.audio)
    duration = len(x) / SR
    n_frames = int(np.ceil(duration * a.fps))
    hop_rate = SR / HOP

    freqs, _, Z = signal.stft(x, SR, nperseg=N_FFT, noverlap=N_FFT - HOP)
    M = np.abs(Z)
    db = band_log_energy(M, freqs)
    norm = {n: normalize_db(v) for n, v in db.items()}

    # ---- per-frame curves
    bands, env, slow = {}, {}, {}
    for n, (_, _, rel) in BANDS.items():
        v = to_frames(norm[n], hop_rate, a.fps, n_frames)
        bands[n] = v
        env[n] = attack_release(v, a.fps, rel)
        slow[n] = one_pole(v, a.fps, 0.5)

    total_db = 10 * np.log10((M ** 2).sum(0) + 1e-10)
    energy = to_frames(normalize_db(total_db, gamma=1.2), hop_rate, a.fps, n_frames, "mean")
    energy = one_pole(energy, a.fps, 0.08)

    # ---- onsets (use un-gammaed dB so quiet hits still register)
    def lin(nm):  # 0..1 linear dB scale
        return normalize_db(db[nm], gamma=1.0)

    kick_flux = flux_of(lin("sub")) + flux_of(lin("bass"))
    snare_flux = flux_of(lin("mid")) + flux_of(lin("highmid"))
    hat_flux = flux_of(lin("air"))
    any_flux = kick_flux + snare_flux + hat_flux * 0.5

    kick_lvl = np.maximum(lin("sub"), lin("bass"))
    snare_lvl = np.maximum(lin("mid"), lin("highmid"))
    hat_lvl = lin("air")
    any_lvl = np.maximum(np.maximum(kick_lvl, snare_lvl), hat_lvl)
    events = {
        "kick": pick_events(kick_flux, hop_rate, a.fps, 0.12, kick_lvl, 0.45),
        "snare": pick_events(snare_flux, hop_rate, a.fps, 0.15, snare_lvl, 0.45),
        "hat": pick_events(hat_flux, hop_rate, a.fps, 0.06, hat_lvl, 0.35),
        "any": pick_events(any_flux, hop_rate, a.fps, 0.05, any_lvl, 0.40),
    }

    # ---- beat grid
    bpm, off, beats, downs = estimate_beat_grid(kick_flux + snare_flux, hop_rate, kick_flux, duration, a.bpm)
    beats_f = [round(float(b * a.fps), 2) for b in beats]
    downs_f = [round(float(b * a.fps), 2) for b in downs]

    # ---- sections
    dens = np.zeros(n_frames, dtype=np.float32)
    for e in events["any"]:
        i = int(e["f"])
        if 0 <= i < n_frames:
            dens[i] += e["s"]
    dens = uniform_filter1d(dens, size=max(int(a.fps * 0.5), 1))
    dens = dens / (np.percentile(dens, 99) + 1e-9)
    sections = find_sections(energy, np.clip(dens, 0, 1), downs_f, a.fps, n_frames)

    r3 = lambda arr: [round(float(v), 3) for v in arr]
    out = {
        "version": 1, "fps": a.fps, "duration": round(duration, 3),
        "durationInFrames": n_frames, "bpm": round(float(bpm), 2),
        "beatOffset": round(float(off), 3),
        "beats": beats_f, "downbeats": downs_f,
        "bands": {k: r3(v) for k, v in bands.items()},
        "env": {k: r3(v) for k, v in env.items()},
        "slow": {k: r3(v) for k, v in slow.items()},
        "events": events, "sections": sections, "energy": r3(energy),
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"{duration:.1f}s  {n_frames} frames @ {a.fps}fps  ~{bpm:.1f} BPM (first beat {off:.2f}s)")
    print("events:", {k: len(v) for k, v in events.items()})
    for s in sections:
        print(f"  section {s['start']/a.fps:6.1f}s - {s['end']/a.fps:6.1f}s  {s['role']:6s} intensity {s['intensity']:.2f}")
    print(f"wrote {a.out} ({os.path.getsize(a.out)/1e6:.1f} MB)")

    if a.plot:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        t = np.arange(n_frames) / a.fps
        fig, ax = plt.subplots(3, 1, figsize=(16, 9), sharex=True)
        for n in ["sub", "bass", "mid", "highmid", "air"]:
            ax[0].plot(t, env[n], lw=0.8, label=n)
        ax[0].legend(ncol=5, loc="upper right"); ax[0].set_title("env (instant attack, band release)")
        ax[1].plot(t, energy, "k", lw=1)
        for s in sections:
            ax[1].axvline(s["start"] / a.fps, color="r", lw=1)
            ax[1].text(s["start"] / a.fps + 0.3, 0.92, s["role"], color="r", fontsize=8)
        ax[1].set_title("energy + section hints")
        for name, c, y in [("kick", "C0", 3), ("snare", "C1", 2), ("hat", "C2", 1)]:
            ax[2].vlines([e["f"] / a.fps for e in events[name]], y - 0.4, y - 0.4 + np.array([e["s"] for e in events[name]]) * 0.8, color=c, lw=0.6)
        ax[2].vlines([b / a.fps for b in downs_f], 0, 4, color="k", lw=0.4, alpha=0.5)
        ax[2].set_yticks([1, 2, 3]); ax[2].set_yticklabels(["hat", "snare", "kick"])
        ax[2].set_xlabel("seconds")
        plt.tight_layout(); plt.savefig(a.plot, dpi=80)
        print("plot:", a.plot)


if __name__ == "__main__":
    sys.exit(main())
