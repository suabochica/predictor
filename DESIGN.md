---
version: alpha
name: Predicto
description: Design file for the predictor app.
colors:
  primary: "#201D13"
  secondary: "#7B745B"
  tertiary: "#F5C211"
  neutral: "#F8F8F7"
  surface: "#FFFFFF"
  on-tertiary: "#0A0A0A"
  border: "#E8E7E3"
  surface-hover: "#F3F1EC"
  border-strong: "#D5D1C8"
  muted: "#949C8B"
  success: "#3A5A3C"
  on-success: "#FFFFFF"
  error: "#B91C1C"
  on-error: "#FFFFFF"
  warning: "#B45309"
  on-warning: "#FFFFFF"
  info: "#475569"
  on-info: "#FFFFFF"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
    fontWeight: 700
  h2:
    fontFamily: Public Sans
    fontSize: 1.5rem
    fontWeight: 600
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
    fontWeight: 400
  body-sm:
    fontFamily: Public Sans
    fontSize: 0.875rem
    fontWeight: 400
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 0.75rem
    fontWeight: 600
  label-md:
    fontFamily: Space Grotesk
    fontSize: 0.875rem
    fontWeight: 500
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.tertiary}"
    rounded: "{rounded.sm}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 20px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
---

# Heritage

## Overview

Architectural minimalism meets journalistic gravitas. The UI evokes a premium matte finish — a high-end broadsheet or contemporary gallery.

## Colors

The palette is rooted in semantic tokens. Use the role (e.g. `{colors.primary}`) — never the hex literal — when authoring components.

- **primary (#201D13)**
- **secondary (#7B745B)**
- **tertiary (#F5C211)**
- **neutral (#F8F8F7)**
- **surface (#FFFFFF)**
- **on-tertiary (#0A0A0A)**
- **border (#E8E7E3)**

## Typography

| Token | Font | Size | Weight |
| --- | --- | --- | --- |
| `h1` | Public Sans | 3rem | 700 |
| `body-md` | Public Sans | 1rem | 400 |
| `label-caps` | Space Grotesk | 0.75rem | 600 |

## Layout

Spacing scale (use the named scale; avoid arbitrary values):

- `spacing.sm` — 8px
- `spacing.md` — 16px
- `spacing.lg` — 24px

## Elevation & Depth

Depth is conveyed through tonal layering and subtle borders rather than drop shadows. Cards lift from the warm neutral background through pure-white surfaces and a single hairline border.

## Shapes

Corner radius scale:

- `rounded.sm` — 4px
- `rounded.md` — 8px

## Components

### button-primary
- backgroundColor: `{colors.tertiary}`
- textColor: `{colors.on-tertiary}`
- rounded: `{rounded.sm}`
- padding: `12px 20px`

### button-secondary
- backgroundColor: `transparent`
- textColor: `{colors.tertiary}`
- rounded: `{rounded.sm}`
- padding: `12px 20px`

### card
- backgroundColor: `{colors.surface}`
- textColor: `{colors.primary}`
- rounded: `{rounded.md}`
- padding: `20px`

### input
- backgroundColor: `{colors.surface}`
- textColor: `{colors.primary}`
- rounded: `{rounded.sm}`
- padding: `10px 14px`

## Do's and Don'ts

- Do use the tertiary color sparingly — only for the highest-emphasis action.
- Don't combine more than two type families on a single screen.
- Don't use full-width images without a generous bottom margin.
- Do default to the warm neutral background; reserve pure white for cards.
