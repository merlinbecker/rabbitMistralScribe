# Design Guidelines: Rabbit R1 Audio Notes PWA

## Design Approach

**Selected Approach**: Minimal Design System (Apple HIG-inspired)
**Justification**: This is a utility-first recording tool for a 240x282px device. Clarity, immediate functionality, and visual feedback are paramount. The 16x16 LED pixel display serves as the primary visual element.

## Core Design Principles

1. **Touch-First Optimization**: All interactive elements sized for 240px width
2. **Visual Feedback Priority**: LED display dominates the interface
3. **Minimal Chrome**: Maximize space for recording visualization and status
4. **Single-Action Focus**: One primary action visible at a time

---

## Typography

**Font Family**: System fonts only (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto)
**Hierarchy**:
- **Display/Status**: 24px, bold weight - Recording status, timer
- **Body**: 14px, regular weight - Labels, secondary info
- **Caption**: 11px, medium weight - Metadata, timestamps

**Constraints**: Given 240px width, limit line length and use sentence case throughout

---

## Layout System

**Spacing Primitives**: Tailwind units of **2, 3, 4, 6**
- Base padding: `p-3` (12px)
- Component spacing: `gap-2` (8px)  
- Section separation: `space-y-4` (16px)

**Grid Structure**:
- Single column only (240px width constraint)
- Full-bleed LED display
- Stack all controls vertically

---

## Component Library

### 1. LED Pixel Display (16x16 Grid)
- **Size**: Full width minus 8px padding each side (224px × 224px)
- **Grid**: 16×16 cells with 1px gaps
- **Colors**: Dynamic based on frequency
  - Low frequency: Orange (#FF8C00)
  - Mid frequency: Yellow (#FFD700)  
  - High frequency: Red (#FF4500)
- **Background**: Black (#000000) for inactive pixels
- **Corner Radius**: 1px per pixel for subtle softness

### 2. Recording Control (Primary Button)
- **Size**: Full width minus 16px horizontal padding
- **Height**: 48px (touch-optimized)
- **States**:
  - Idle: "Start Recording" 
  - Recording: "Stop Recording" with pulsing indicator
- **Position**: Fixed at bottom with 12px margin

### 3. Status Bar (Top)
- **Height**: 32px
- **Layout**: Horizontal flex with space-between
- **Left**: Recording timer (00:00 format)
- **Right**: Connection status icon (online/offline)
- **Background**: Semi-transparent overlay

### 4. Queue/History List
- **Item Height**: 56px each
- **Layout**: Vertical stack with 8px gaps
- **Content**: 
  - Timestamp (11px, top)
  - Status badge (11px, "Transcribed" / "Pending")
  - Title/preview (14px, truncated)
- **Max Items Visible**: 3-4 before scroll

### 5. Authentication Screen
- **Layout**: Centered vertical stack
- **Logo/Title**: 24px bold, centered
- **GitHub Button**: Full width, 48px height, GitHub icon + "Sign in with GitHub"
- **Spacing**: `space-y-6`

---

## Screen States

### Recording View (Primary)
```
┌─────────────────────┐
│ 00:15    ●  Online  │ Status Bar
├─────────────────────┤
│                     │
│   16×16 LED Grid    │ Visualization
│   (224×224px)       │
│                     │
├─────────────────────┤
│                     │
│ Recent Notes (3)    │ Queue Preview
│                     │
├─────────────────────┤
│  [Stop Recording]   │ Primary Action
└─────────────────────┘
```

### Idle View
- Same structure but LED grid shows ambient/idle animation
- Primary button: "Start Recording"
- Queue list expanded to show more items

### Offline Indicator
- Toast notification at top: "Offline - recordings will sync later"
- Yellow accent on queue items awaiting upload

---

## Visual Treatment

**Borders**: 1px solid with subtle gray (#333333) for separators only
**Shadows**: None (minimize visual complexity)
**Corner Radius**: 
- Buttons: 8px
- Cards/Items: 6px
- Pixels: 1px

**Transitions**: 
- State changes: 150ms ease
- LED updates: Instant (real-time feel)

---

## Accessibility

- Minimum touch target: 44×44px (recording button exceeds this at 48px)
- Color contrast: All text meets WCAG AA against backgrounds
- Focus states: 2px outline for keyboard navigation
- Recording status announced via aria-live regions

---

## PWA-Specific

**Install Prompt**: Minimal banner, 40px height, dismissible
**Offline Screen**: Centered message with retry button
**Loading States**: Spinner (24px) centered with loading text below

---

## Images

**No hero images** - This is a utility tool optimized for an extremely small display. The LED pixel visualization serves as the primary visual element. All other UI elements prioritize functionality and clarity over decorative imagery.