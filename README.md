# Pulse — the K-pop companion app

Pulse is a premium, dark-mode-first companion app for K-pop fans: a single home
for daily news, new releases, live charts, comebacks, concerts, and birthdays.
This repo currently contains the **Home screen** experience, built on an
architecture designed to scale into the full app (artist profiles, discography,
calendar, bookmarks, and more) without refactoring.

Design language is inspired by Apple Music, Spotify, Linear, and Airbnb:
dark surfaces, generous whitespace, rounded cards, subtle motion, and no
clutter.

## Tech stack

- [Expo](https://expo.dev) (SDK 57) + [Expo Router](https://docs.expo.dev/router/introduction/) for file-based navigation
- React Native 0.86 + React 19 + TypeScript (strict)
- [NativeWind](https://www.nativewind.dev/) (Tailwind CSS for React Native) for styling
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) + [Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/) for animation
- [React Native SVG](https://github.com/software-mansion/react-native-svg), [Expo Blur](https://docs.expo.dev/versions/latest/sdk/blur-view/), [Expo Haptics](https://docs.expo.dev/versions/latest/sdk/haptics/)
- [TanStack Query](https://tanstack.com/query/latest) for async data fetching/caching
- [Zustand](https://zustand-demo.pmnd.rs/) for lightweight client state (bookmarks, saves)
- [FlashList](https://shopify.github.io/flash-list/) for high-performance horizontal lists

## Getting started

```bash
npm install
npm start        # then press i / a / w, or scan the QR code with Expo Go
```

Other scripts:

```bash
npm run ios       # run on iOS simulator (macOS only)
npm run android   # run on an Android emulator/device
npm run web       # run in the browser
npm run typecheck # strict TypeScript check
```

## Project structure

```
src/
  app/                    Expo Router routes (file-based navigation)
    _layout.tsx           Root layout: providers, gesture root, global styles
    (tabs)/                Bottom tab navigator group
      _layout.tsx          Custom animated tab bar wiring
      index.tsx            Home screen
      discover.tsx         Placeholder — Discover tab
      charts.tsx           Placeholder — Charts tab
      calendar.tsx         Placeholder — Calendar tab
      profile.tsx          Placeholder — Profile tab
  components/
    home/                  Home-screen-specific components
    ui/                    Generic, reusable design-system primitives
    navigation/            Custom bottom tab bar
  hooks/                   React Query hooks per data domain
  services/                Mock "API" layer (async, typed, swappable for real APIs)
  models/                  Shared TypeScript interfaces (News, Artist, Album, ...)
  data/                    Mock JSON fixtures consumed by services
  store/                   Zustand stores (bookmarks, saved albums)
  theme/                   Design tokens (color/spacing/typography) + global.css
  constants/               Layout, animation, tab, and query-key constants
  utils/                   Small pure helpers (date formatting, mock delay)
```

## Design system

All tokens live in `tailwind.config.js` and are mirrored as raw JS constants in
`src/theme/` for use outside of className strings (gradients, SVG, Reanimated
interpolation).

| Token       | Value                     |
| ----------- | ------------------------- |
| Background  | `#09090B`                 |
| Surface     | `#111113`                 |
| Card        | `#18181B`                 |
| Border      | `rgba(255,255,255,0.06)`  |
| Accent      | `#FF4DA6`                 |
| Radius      | `24px` cards               |

## Data layer

Every section on the Home screen is powered by a `services/*.service.ts`
module that exposes `async` functions returning typed mock data with a
simulated network delay (`src/utils/delay.ts`). Swapping mock data for a real
backend later means changing the implementation of these functions only —
every hook, component, and screen is already written against the final
`models/*` interfaces.

## Notes on this scaffold

This repository previously contained an unrelated native Android/Kotlin demo
app. It has been fully replaced with this Expo/React Native project per
project direction.
