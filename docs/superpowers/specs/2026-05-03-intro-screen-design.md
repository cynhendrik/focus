# Intro Screen Design

## Overview

An animated intro screen plays once on every app start before the main CYNERA SYSTEM OS UI is shown. Black fullscreen background, two text phases with fade animations, then transition into the app.

## Timing

| Time  | Event |
|-------|-------|
| 0.0s  | Black screen visible |
| 0.3s  | Phase 1 text fades in (duration: 0.7s) |
| 1.5s  | Phase 1 text holds |
| 2.0s  | Phase 1 text fades out (duration: 0.5s) |
| 2.5s  | Phase 2 text fades in (duration: 0.7s) |
| 3.5s  | Intro ends, app fades in |

## Content

- **Phase 1:** "If we build, we build to lead."
  - Small, elegant, wide letter-spacing (0.15em), light weight
- **Phase 2:** "CYNERA SYSTEMS OS"
  - Larger, bold, matches existing app logo styling

## Animation

- Style: Fade in / fade out (Framer Motion)
- No skip mechanism
- App entrance: fade in after intro completes

## Components

- `src/components/IntroScreen.jsx` — self-contained intro, accepts `onComplete` callback
- `src/main.jsx` — wraps App with intro state, renders IntroScreen first then App via AnimatePresence

## Constraints

- Uses Framer Motion (already in project)
- No new dependencies required
- IntroScreen has no knowledge of App internals
