---
name: Aura Feedback
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#c7c6cc'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#919096'
  outline-variant: '#46464b'
  surface-tint: '#c5c5d2'
  primary: '#c5c5d2'
  on-primary: '#2e303a'
  primary-container: '#12141d'
  on-primary-container: '#7d7e8a'
  inverse-primary: '#5c5e69'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#47d6ff'
  on-tertiary: '#003543'
  tertiary-container: '#00171e'
  on-tertiary-container: '#008aa9'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e1ef'
  primary-fixed-dim: '#c5c5d2'
  on-primary-fixed: '#191b24'
  on-primary-fixed-variant: '#454651'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#b6ebff'
  tertiary-fixed-dim: '#47d6ff'
  on-tertiary-fixed: '#001f28'
  on-tertiary-fixed-variant: '#004e60'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin: 32px
---

## Brand & Style

The design system is anchored in a philosophy of "Luminous Intelligence." It balances a sophisticated, professional foundation with an approachable, human-centric interface. The aesthetic is a hybrid of **Modern Minimalism** and **Glassmorphism**, creating a sense of depth and transparency that reflects the clarity of the feedback provided by the AI.

The interface should feel like a high-end physical tool—weightless yet precise. By using deep, grounding tones contrasted with ethereal, glowing accents, this design system fosters an environment of trust and technological advancement. All interactions should feel fluid and intentional, avoiding abrupt changes in favor of soft state transitions.

## Colors

The palette is designed to emphasize the AI's "presence" through light. 

- **Primary (Deep Charcoal):** Used for the core background and deep surfaces to provide a high-contrast environment for data and text.
- **Secondary (Soft Indigo):** Acts as the brand's stabilizing force, used for primary actions and subtle highlights.
- **Tertiary (Electric Blue):** Reserved exclusively for AI-driven elements, suggestions, and active feedback states. It should appear to "glow."
- **Neutrals:** A range of cool grays and slates provide hierarchy for secondary text and borders without distracting from the primary content.

## Typography

This design system utilizes **Inter** for its exceptional readability in tech-heavy environments. The typographic hierarchy is built on a tight scale to maintain a professional, data-centric feel. 

Headlines use slightly tighter letter spacing to feel "locked-in" and authoritative. Labels are capitalized and tracked out to provide clear distinction for metadata and small categorizations. Line heights are generous for body text to ensure that long-form feedback remains legible and reduces cognitive load.

## Layout & Spacing

The layout follows a **Fixed Grid** system for desktop (12 columns) and a **Fluid Grid** for mobile devices. The rhythm is based on an 8px square grid, ensuring consistent vertical and horizontal alignment.

Content should be grouped into logical modules with generous white space (using `lg` and `xl` tokens) between major sections to prevent the interface from feeling cluttered. Marginal space is prioritized to keep the user's focus centered on the feedback modules.

## Elevation & Depth

Hierarchy is achieved through **Glassmorphism** and **Tonal Layers** rather than traditional heavy shadows.

- **Base Layer:** The Deep Charcoal background (#12141D).
- **Glass Layer:** Semi-transparent containers (Background: `rgba(255, 255, 255, 0.03)`) with a `backdrop-filter: blur(12px)`.
- **Accent Depth:** AI-interactive components use a subtle "inner glow" (a 1px semi-transparent Electric Blue border) to signify their active status.
- **Shadows:** When necessary for separation, use extra-diffused, low-opacity indigo-tinted shadows (`rgba(99, 102, 241, 0.15)`) to maintain the ethereal brand feel.

## Shapes

The shape language is consistently **Rounded**. This softens the "tech" feel of the AI, making the feedback feel more like a conversation and less like a technical audit. 

Standard components (buttons, inputs) utilize the base `0.5rem` radius. Large containers and glass cards utilize `1rem` or `1.5rem` to create a friendly, modern frame for content. Pills are used exclusively for status indicators and tags.

## Components

- **Buttons:** Primary buttons are Solid Indigo with white text. Secondary buttons are ghost-style with a thin Soft Indigo border. AI-specific "Generate" or "Analyze" buttons utilize a gradient from Soft Indigo to Electric Blue.
- **Feedback Cards:** These are the centerpiece of the system. They must utilize the Glassmorphism style with a 1px border (`rgba(255, 255, 255, 0.1)`).
- **Input Fields:** Darker than the base background, with a subtle Electric Blue glow on focus. Labels sit just above the field in the `label-md` style.
- **Chips & Tags:** Small, pill-shaped elements with low-opacity background fills of their respective categories (e.g., Sentiment: Positive = Green-tinted Glass).
- **AI Progress Indicators:** Use smooth, pulsing Electric Blue animations rather than standard spinning loaders to signify "thought" and active processing.
- **Transitions:** All hover states and modal entries should use a `cubic-bezier(0.4, 0, 0.2, 1)` timing function for a "weightless" feel.