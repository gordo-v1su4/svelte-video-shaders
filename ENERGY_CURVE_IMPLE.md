Yep — your API already has “Energy Curve” built in (plus rhythm + structure, and optional classification/tonal). My earlier assumption that “energy curve isn’t in the sources” doesn’t apply to this endpoint: it’s explicitly in the OpenAPI schema as EnergyData.curve.

What your Essentia API already provides (from the OpenAPI)
Endpoints (all accept multipart/form-data with a file field)

POST /analyze/rhythm → BPM, beats, confidence, onsets, duration, energy

POST /analyze/structure → sections + boundaries

POST /analyze/classification → genres/moods/tags (Essentia TF models)

POST /analyze/full → rhythm + structure + (optional) classification + (optional) tonal, and includes energy curve

The “energy curve” is already there

Schema shows:

energy: { mean, std, curve: number[] }

So you can treat:

energy.curve[] as your per-frame energy / “energy curve”

optionally normalize it client-side with mean/std (or just min-max it)

Since you “need both” (curve + markers/sections): call /analyze/full

That single call gives you:

Time markers: beats[], onsets[] (in seconds)

Energy curve: energy.curve[] (+ mean/std)

Structure: structure.sections[] with labels + boundaries (in seconds)

Minimal client call (fetch)
const form = new FormData();
form.append("file", wavFile); // File/Blob from upload

const res = await fetch("https://essentia.v1su4.com/analyze/full", {
  method: "POST",
  body: form,
});

const data = await res.json();

// editor-ready pieces:
const beatsSec = data.beats;             // [number]
const onsetsSec = data.onsets;           // [number]
const energyCurve = data.energy.curve;   // [number]
const sections = data.structure.sections; // [{start,end,label,duration,energy}]

How to use it in your editor (given videos are separate)

Drive cut suggestions / snap points from onsets[] + beats[]

Drive audio-reactive intensity from energy.curve[]

Drive high-level chaptering from structure.sections[] (intro/verse/chorus/etc.)

If you want, paste a sample /analyze/full response (even truncated) and I’ll tell you exactly how to map energy.curve to timeline time (since the API doesn’t specify the hop size in the schema, we infer it from duration and curve.length).

this would be for speed ramping the energy cuvre
Thought for 11s

Perfect use case. Your API already returns everything you need to drive speed ramping from energy:

duration (seconds)

energy.curve[] (array of numbers) + mean/std

(optionally) beats[] / onsets[] for snapping ramps to musical events

How to turn energy.curve into speed ramps
1) Get a timestamp for each energy sample

The schema doesn’t specify hop size, but you do get duration and curve.length, so you can derive a uniform timestep:

Let N = energy.curve.length

Let dt = duration / (N - 1) (or / N if you prefer “bin width”; I usually use (N-1) so last point aligns to duration)

const N = energy.curve.length;
const dt = duration / Math.max(1, (N - 1));
const tSec = Array.from({ length: N }, (_, i) => i * dt);

2) Normalize energy into 0–1 (stable across songs)

You can use mean/std (already returned) , then clamp:

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

const z = energy.curve.map(v => (v - energy.mean) / (energy.std || 1e-9));
const e01 = z.map(v => clamp01((v + 2) / 4)); // map z≈[-2..+2] → [0..1]


(If you want a simpler approach: min-max normalize the curve, but mean/std tends to behave better across different masters.)

3) Smooth it (so ramps feel intentional, not jittery)

Use an EMA or moving average:

function ema(arr, alpha=0.15){
  let y = arr[0] ?? 0;
  return arr.map(x => (y = alpha*x + (1-alpha)*y));
}
const eSmooth = ema(e01, 0.12);

4) Map energy → playback speed

Decide your speed range (example: low energy = slow, high energy = fast):

const minSpeed = 0.7;   // slow-mo
const maxSpeed = 1.6;   // fast
const gamma = 1.6;      // >1 makes highs punchier

const speed = eSmooth.map(e => {
  const shaped = Math.pow(e, gamma);
  return minSpeed + (maxSpeed - minSpeed) * shaped;
});

5) Convert the per-sample speed into editor keyframes

You generally don’t want thousands of keyframes. Downsample + keep corners:

sample every X ms (e.g., 100–200ms)

optionally “snap” keyframes to beats/onsets for musical coherence

const step = Math.max(1, Math.round(0.15 / dt)); // ~150ms
const keyframes = [];
for (let i = 0; i < N; i += step) {
  keyframes.push({ t: tSec[i], speed: speed[i] });
}

6) Apply speed ramps as a time-remap curve

To actually speed-ramp video while audio stays real-time, you want a time mapping:

Let t = project/audio time (seconds)

Let s(t) = speed factor at time t

The source-video time you should sample is:

𝑢
(
𝑡
)
=
∫
0
𝑡
𝑠
(
𝜏
)
 
𝑑
𝜏
u(t)=∫
0
t
	​

s(τ)dτ

Discrete approximation:

// cumulative integral: u[i] = sourceTime at projectTime t[i]
const u = new Array(N).fill(0);
for (let i = 1; i < N; i++) {
  const sAvg = (speed[i-1] + speed[i]) * 0.5;
  u[i] = u[i-1] + sAvg * dt;
}


Now you have a remap curve: project time → source time.

If you’re rendering a single continuous “visual track”, you sample visuals at u(t) while the audio plays at t.

If you’re dealing with multiple clips, you apply u(t) per clip region (piecewise), or you compute ramps inside each selected segment.

Using beats/onsets to make ramps feel “musical”

Since /analyze/full gives beats[] and onsets[] in seconds , a strong pattern is:

only allow ramp keyframes at beats (or at onsets for impact cuts)

set speed targets from nearby energy values

interpolate between those targets

That makes ramps land on rhythm instead of floating.

If you paste one real /analyze/full response (just duration + first ~30 of energy.curve is enough), I’ll show you:

the inferred dt

a good smoothing/downsample setting for your curve density

and a ramp preset (subtle vs aggressive) tailored to your editor.