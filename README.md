# Outbreak Epidemiology Disease Simulator

Interactive, browser-based SIR-style outbreak simulator with vaccination, mutation, and time manipulation.  
Runs entirely in your browser — no backend, no dependencies.

**Note:** This tool is for intuition-building, teaching, and experimentation only. It is **not** calibrated or validated for real-world forecasting or clinical/public-health decision-making.

---

## Overview

- Single-file app: **HTML + CSS + JavaScript**
- Deterministic, grid-based **SEIRD** toy model with:
  - Susceptible (S)
  - Exposed (E)
  - Infectious (I)
  - Recovered/Immune (R)
  - Dead (D)
- Takes custom seed for initial values
- Light and Dark mode
- No external libraries; works offline

Open `index.html` in any modern browser to start.

---

## Features

### Population & Layout

- Adjustable **population size (N)** up to 10,000.
- Choose **4-neighbor (square)** or **6-neighbor (hex-like)** contact structure.
- Individuals rendered on a responsive canvas:
  - Color-coded by SEIRD state.
  - Vaccination status indicated by solid/dashed rings.

### Disease Dynamics

- SEIRD-style transitions driven by:
  - Infection rate **β**
  - Recovery rate **γ**
  - Mortality rate **μ**
  - Time step **Δt**
  - Optional stochastic infection behavior
- Derived indicators:
  - **R₀** (from β and γ)
  - **Rₜ** (from R₀ and current susceptible fraction)

### Vaccination & Mutation

- **Vaccine efficacy (%)**
- **Coverage (%)** for initial allocation
- **Daily vaccination rate** (percentage-point increase per day)
- Effective vs. ineffective vaccination tracked separately.
- **Mutation / waning immunity rate**:
  - Immune or effectively vaccinated can revert to susceptible.

### Scenarios

Preset configurations (illustrative, not epidemiologically exact):

- Custom
- Rare Disease
- Endemic Stability
- Acute Outbreak
- Flu-like
- COVID-like
- Measles-like
- Ebola-like
- SARS-1-like
- MERS-like
- Norovirus-like

Selecting a preset updates parameters and reinitializes the simulation.

### Simulation Controls

- **Run / Pause**:
  - Toggle continuous simulation via `requestAnimationFrame`.
- **Reset**:
  - Re-seed, rebuild population, and clear history.
- **Auto-stop**:
  - Optionally pause automatically once the system stabilizes.

### Timeline & Scrubbing

- Full history stored per step:
  - SEIRD counts
  - Incidence
  - Prevalence
  - Vaccination coverage
- **Scrubber**:
  - Jump to any past time point and inspect:
    - Grid state
    - Sidebar counts
    - Charts
- **Live** button:
  - Return to latest state.
- Changing selected parameters can **branch** from the current snapshot:
  - Some controls trigger full reset.
  - Others (e.g. β/γ/μ, vaccination settings) branch from history in-place.

### Visual Panels

- **Population Grid**
  - Color-coded individuals, vaccine rings, hex/square layout.
- **Sidebar Status Bar**
  - Stacked vertical bar showing current composition of S/E/I/R/D.
  - Counts and percentages for:
    - SEIRD compartments
    - Vaccinated (effective / ineffective).
- **Charts**
  - **Incidence, Prevalence & % Vaccinated**
    - Incidence per step
    - Number infectious
    - Vaccination coverage
  - **SEIRD Compartments**
    - Time series of S, E, I, R, D

### Export

- **Export Time Series (CSV)**:
  - `t, S, E, I, R, D, inc, prev, cumInc`
  - For further analysis or plotting in external tools.

---

## Implementation Notes

- Core logic organized around a global `State` object:
  - `State.people` holds per-individual state.
  - `State.series` stores time series.
  - `State.snapshots` power timeline scrubbing / branching.
- `step()`:
  - Applies infection, progression, recovery, mortality, mutation, and vaccination.
  - Updates series and snapshots.
- `drawCanvas()`:
  - Renders individuals based on current time or scrubbed snapshot.
- `drawCharts()`:
  - Canvas-based charts, responsive to window resize and theme.
- `setSeed()`:
  - Overwrites `Math.random` with a simple LCG for reproducibility.
  - Swap to a dedicated RNG if required for integration.

---

## Usage

- Open `index.html`.
- Choose a preset or configure:
  - N, initial infected/immune, β, γ, μ, vaccination, mutation, etc.
- Click **Run** to evolve the system.
- Use the scrubber and charts to explore dynamics.
- Click **Export Time Series (CSV)** to analyze results elsewhere.

---

## License (MIT)

Copyright (c) 2025 TapTiger Dev

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
