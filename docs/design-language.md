# Nerve Design Language

## North Star

Nerve should feel like a private operating layer: quiet, precise, and close to the glass of the screen. The interface borrows the discipline of modern YC product surfaces, the lightness of transparent morphism, and the confidence of minimalist AI tools, but it should not look like a cloned landing page. It is a working assistant, not a brochure.

The product promise is simple: reduce friction when attention is fragile. Every visual choice should make the next action easier to perceive, easier to trust, and easier to complete.

## Design Principles

1. Calm over decoration.
   UI chrome should recede. The active step, current state, and next action are the visual hierarchy.

2. Glass as context, not ornament.
   Transparent surfaces are used for app chrome, overlays, and panels that sit above the user's desktop. Nested content should become flatter and denser so the whole app does not turn into stacked frosted boxes.

3. Minimal but not empty.
   YC-style minimalism works when the information density is high and the controls are obvious. Prefer tight grids, hairline dividers, clear labels, and compact controls over big empty hero space.

4. Private and local by feel.
   The app handles screenshots and focus state. The design should feel sober, local, and trustworthy. Avoid loud gradients, playful mascots, and novelty decoration.

5. Gentle momentum.
   The interface should reduce the emotional weight of starting. Microcopy stays direct, nonjudgmental, and physical: what to do next, what changed, what is paused.

## Visual Identity

### Personality

- Precise
- Calm
- Attentive
- Transparent
- Technical without feeling cold

### Signature Motif

The signature is "thin glass over useful structure": translucent panels, crisp dark type, faint borders, and a restrained black primary action. Accent color appears only when it communicates state.

## Color System

### Neutrals

- Ink 900: `#151719`
- Ink 800: `#202428`
- Ink 700: `#32383d`
- Ink 600: `#4c545a`
- Ink 500: `#697177`
- Ink 400: `#90979d`
- Ink 300: `#b8bdc2`
- Ink 200: `#dfe2e5`
- Ink 100: `#eef0f1`
- Paper: `#f7f8f8`
- Warm paper: `#f4f2ed`

Use neutrals for most of the product. The UI should read as clear glass and ink, not as a themed color wash.

### Functional Accents

- Blue `#2563eb`: active navigation, focus, current item
- Mint `#2c8f73`: progress, on-task, completed-positive states
- Amber `#a36514`: due dates, paused state, warnings
- Red `#b13b3b`: destructive actions and errors

Accent colors should be sparse. If more than one or two accents are visible in a stable screen, something is probably too loud.

## Materials

### App Chrome

Use the strongest glass treatment for global chrome:

- Background: `rgba(255, 255, 255, 0.5-0.72)`
- Border: white hairline plus a faint neutral bottom edge
- Blur: `blur(28px) saturate(1.35)`
- Shadow: broad, soft, low alpha

### Work Panels

Panels carry the primary task surface:

- Radius: 12px
- Padding: 22-30px depending on density
- Border: light glass hairline
- Shadow: present but quiet

### Repeated Cards and Rows

Cards should be practical and flatter:

- Radius: 8px
- Border: neutral hairline
- Background: translucent white
- Shadow: very light or none when inside a dense list

## Typography

Use the system UI stack to stay native on Windows:

`"Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif`

Scale:

- Product title: 21px, 760 weight
- Section title: 22px, 720 weight
- Compact card title: 15-16px, 700 weight
- Body: 13-15px, 400-520 weight
- Labels and status: 10-12px, 620-760 weight

Rules:

- Letter spacing stays `0`.
- Use sentence case for labels and actions.
- Use uppercase only for tiny structural labels such as "Current step".
- Long task text must wrap cleanly and never resize layout unexpectedly.

## Layout

The product has two layout modes:

1. Main command surface
   A centered or two-column workspace for setup, editing, history, and logs.

2. Desktop overlay
   A narrow glass rail that sits above other windows and prioritizes glanceability.

Spacing follows a 4px grid:

- 4px: micro gaps
- 8px: compact control gaps
- 12px: row gaps
- 16px: section rhythm
- 20-24px: column and panel rhythm
- 28-30px: empty-state or handoff breathing room

## Components

### Top Bar

The top bar is translucent app chrome. It should hold brand, status, and navigation without becoming a hero.

- Brand mark: compact, dark, slightly dimensional
- Tabs: segmented control, not large nav pills
- Active tab: white glass lift, dark text

### Buttons

Buttons are compact, tactile, and icon-led when an icon exists.

- Primary: dark ink gradient, white text
- Secondary: translucent white
- Danger: red text on faint red glass
- Icon buttons: square 34-36px controls

Do not create verbose pill buttons when an icon is clearer.

### Forms

Inputs should feel like editable glass fields:

- 40px base height
- 9px radius
- White translucent fill
- Blue focus ring
- Labels above fields, 12px, semibold, muted ink

### Status Pills

State color is semantic:

- On task or progress: mint
- Stuck, paused, due soon: amber
- Unknown or holding: neutral
- Error or destructive: red

### Timetable Rows

Rows should be dense and scannable:

- Left: time and schedule metadata
- Middle: editable activity
- Right: task type and destructive controls
- Active state: blue border or inset line
- Past due: amber-tinted background

### Overlay

The overlay is the strongest expression of transparent morphism.

- Slim rail: 56px width
- Expanded rail: about 272px width
- Background: high-blur translucent white
- Progress: vertical blue-to-mint rail
- Step card: compact, no nested decoration

## Motion

Motion should be quiet and physical:

- Hover lift: `translateY(-1px)`
- Active press: return to baseline
- Transition duration: 120-160ms
- Avoid looping ambient animation

## Accessibility

- Preserve visible focus states.
- Keep all text at readable contrast against glass.
- Never rely on transparency alone to separate controls.
- Buttons and fields should stay at least 34px tall in compact overlay contexts and 36-40px in the main app.
- Long text uses `overflow-wrap: anywhere` or ellipsis depending on whether full reading or scanning is more important.

## Copy Voice

The voice is brief, gentle, and concrete.

Use:

- "Next step"
- "Mark done"
- "I will hold this spot."
- "Give me 5 more minutes"

Avoid:

- Hype
- Productivity moralizing
- Long explanations inside the app chrome
- Marketing phrases like "unlock your focus"

## Implementation Notes

The current implementation centralizes the design language in:

- `apps/desktop/src/renderer/src/styles.css`

Tokens live in `:root`. Any new component should first use the existing token set before adding new colors, shadows, or radius values.

When adding screens, choose one of these patterns:

- Centered setup panel for one focused action
- Two-column work surface for task plus list/detail
- Dense list rows for history, logs, reminders, and timetable items
- Overlay rail for glanceable active-session controls
