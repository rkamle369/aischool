---
name: Luminous AI
colors:
  surface: '#15121b'
  surface-dim: '#15121b'
  surface-bright: '#3c3742'
  surface-container-lowest: '#100d16'
  surface-container-low: '#1d1a24'
  surface-container: '#221e28'
  surface-container-high: '#2c2833'
  surface-container-highest: '#37333e'
  on-surface: '#e8dfee'
  on-surface-variant: '#ccc3d8'
  inverse-surface: '#e8dfee'
  inverse-on-surface: '#332f39'
  outline: '#958da1'
  outline-variant: '#4a4455'
  surface-tint: '#d2bbff'
  primary: '#d2bbff'
  on-primary: '#3f008e'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#732ee4'
  secondary: '#5de6ff'
  on-secondary: '#00363e'
  secondary-container: '#00cbe6'
  on-secondary-container: '#00515d'
  tertiary: '#c6c6c7'
  on-tertiary: '#2f3132'
  tertiary-container: '#656768'
  on-tertiary-container: '#e6e6e7'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#a2eeff'
  secondary-fixed-dim: '#2fd9f4'
  on-secondary-fixed: '#001f25'
  on-secondary-fixed-variant: '#004e5a'
  tertiary-fixed: '#e2e2e3'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#15121b'
  on-background: '#e8dfee'
  surface-variant: '#37333e'
typography:
  display-xl:
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
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
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
  unit: 8px
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is centered around the concept of **"Empathetic Intelligence."** It balances the cutting-edge nature of AI with a warm, approachable personality suitable for an educational environment. The brand personality is encouraging, sophisticated, and visionary.

The aesthetic utilizes a blend of **Minimalism** and **Glassmorphism**. High-density information is avoided in favor of "breathing" layouts that prioritize the conversational interface. The "voice-first" nature is expressed through fluid motion, soft blurs, and luminous accents that suggest a living, breathing digital mentor. Every interaction should feel smooth and frictionless, evoking the sensation of light moving through glass.

## Colors

The palette is designed to feel immersive and futuristic. 
- **Primary (Deep Violet):** Used for the core brand identity and the primary canvas. It provides a sense of depth and wisdom.
- **Secondary (Soft Cyan):** Reserved for "Active AI" states, progress indicators, and voice visualization. It acts as the "energy" of the system.
- **Neutral (Clean White/Zinc):** Used for primary text and high-contrast surface elements to ensure maximum legibility against the dark violet background.

Functional colors (Success, Warning, Error) should be slightly desaturated to maintain the premium, soft-glow aesthetic without breaking the immersive experience.

## Typography

This design system utilizes **Inter** exclusively to achieve a clean, systematic, and highly readable interface. 

- **Display & Headlines:** Use tighter letter spacing and heavier weights to create a strong visual hierarchy. These should feel authoritative yet modern.
- **Body Text:** Uses a generous line height (1.5 - 1.6) to ensure learning materials are easy to consume during long study sessions.
- **Labels:** Set in medium weights with slight letter spacing for clarity in navigation and small UI markers.

## Layout & Spacing

The system follows a **12-column fluid grid** for desktop and a **single-column fluid layout** for mobile, with a base 8px spacing rhythm. 

Content should be centered with wide margins to create a focused, "theatrical" experience for the AI interaction. Vertical spacing is intentionally generous (using `stack-lg`) to prevent the UI from feeling cramped, reinforcing the premium and calm brand personality.

## Elevation & Depth

Depth is achieved through **Glassmorphism** and **Soft Glows** rather than traditional shadows.

1.  **Backdrop Blurs:** Secondary surfaces (like cards and sidebars) use a 20px - 30px backdrop blur with a 10% opacity white or violet tint.
2.  **Inner Glows:** Elements at higher elevations feature a subtle 1px "rim light" on the top and left borders to simulate light catching the edge of glass.
3.  **Luminous Orbs:** Soft, out-of-focus cyan and violet gradients should be placed behind primary interaction points to draw the eye without creating hard edges.
4.  **Shadows:** When used, shadows should be highly diffused (40px+ blur) and tinted with the primary violet color at very low opacity (15%).

## Shapes

The shape language is **Rounded**, using "squircle" mathematics for smoother corner transitions. 

Standard components use a 16px (`rounded-lg`) radius to feel friendly and organic. Larger containers like lesson cards or the main chat window use a 24px (`rounded-xl`) radius. Circular shapes are reserved exclusively for the AI "Avatar/Voice" orb and floating action buttons to denote their unique interactive status.

## Components

### Buttons
Primary buttons should feature a subtle linear gradient (Deep Violet to a lighter Indigo) with a soft cyan outer glow on hover. Secondary buttons should use the "ghost-glass" style: a transparent background with a thin white border and backdrop blur.

### AI Voice Visualizer
A central component of the app. It should be a fluid, morphing blob using the Soft Cyan color with a high-intensity glow. The movement should be organic and reactive to audio input.

### Glass Cards
Cards should have no solid background. Instead, use the backdrop-blur effect with a 1px border at 20% white opacity. Text inside cards should always be high-contrast white.

### Inputs & Chat Bar
The chat input should be pill-shaped with a heavy backdrop blur. Use the Soft Cyan for the cursor and active focus states to represent "AI Attention."

### Chips & Progress
Educational tags and progress bars should use semi-transparent cyan fills. Progress bars should have a "shimmer" animation to indicate active learning/processing.