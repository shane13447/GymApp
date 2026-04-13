# Shane's Gym App

React Native gym tracking app built with Expo Router, NativeWind, and SQLite.

The app covers the full training loop:
- create and edit multi-day programs,
- run active workouts with persisted logging,
- maintain an upcoming workout queue,
- review history and profile data,
- send Coach requests through a backend proxy while keeping deterministic queue safeguards local.

## Current stack

- React Native `0.81.5`
- Expo `~54.0.33`
- Expo Router `~6.0.23`
- TypeScript `~5.9.2`
- NativeWind `^4.2.1`
- SQLite via `expo-sqlite`
- Supabase client for Coach proxy auth/token flow
- Jest + ts-jest for tests

## Navigation system

This repo uses **Expo Router file-based navigation**.

- [app/_layout.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/_layout.tsx) is the root stack shell.
- [app/index.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/index.tsx) immediately redirects to `/(tabs)/Home`.
- [app/(tabs)/_layout.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/(tabs)/_layout.tsx) defines the bottom-tab navigator.
- Visible tabs are `Home`, `Programs`, `Coach`, `History`, and `Profile`.
- [app/(tabs)/ActiveWorkout.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/(tabs)/ActiveWorkout.tsx) is a hidden tab route (`href: null`) that is pushed programmatically when starting a workout.
- [app/modal.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/modal.tsx) is a stack modal route outside the tab bar.

## Refactored architecture

The codebase now follows a clearer split between routes, controller hooks, presentational components, and domain services.

### Routes

- `app/`
  - Expo Router route files only.
  - Screens should stay mostly render-focused.

### Controller hooks

- `hooks/`
  - [use-home-data.ts](/C:/Users/Shane/ShanesGymApp/GymApp/hooks/use-home-data.ts): Home screen loading/state.
  - [use-active-workout.ts](/C:/Users/Shane/ShanesGymApp/GymApp/hooks/use-active-workout.ts): active workout orchestration.
  - [use-profile-screen.ts](/C:/Users/Shane/ShanesGymApp/GymApp/hooks/use-profile-screen.ts): profile persistence + autosave workflow.
  - [use-programs-screen.ts](/C:/Users/Shane/ShanesGymApp/GymApp/hooks/use-programs-screen.ts): program create/edit/list workflow.
  - [use-workout-history.ts](/C:/Users/Shane/ShanesGymApp/GymApp/hooks/use-workout-history.ts): history loading/grouping.

### Presentational components

- `components/`
  - `components/programs/`: program-specific UI.
  - `components/workout/`: workout logging UI.
  - `components/coach/`: extracted Coach preview/list blocks.
  - `components/ui/`: shared UI primitives and dialogs.
  - `components/nativewindui/`: UI support components still used by the app.

### Domain services

- `services/database.ts`
  - Stable facade used by screens/hooks.
  - Delegates to extracted domain modules.
- `services/db/`
  - SQLite internals split by concern:
  - `connection.ts`, `programs.ts`, `workouts.ts`, `queue.ts`, `preferences.ts`, `serialization.ts`, `seeds.ts`, `timers.ts`.
- `services/queue/`
  - Deterministic queue codec, diff, repair, and types.
- `services/coach/`
  - Coach orchestration support such as prompt running, response processing, proxy transport, and program-draft generation.
- `services/catalog/`
  - Exercise catalog parsing and variant helpers.
- `services/programs/`
  - Program cloning and day-commit helpers.
- `services/workout-queue-modifier.ts`
  - Legacy high-value queue transformation module that still owns core TOON parsing/repair behavior.

### Pure library helpers

- `lib/`
  - Stateless utilities and screen-independent helpers such as validation, streak/stat calculations, progression, queue-related view helpers, proxy parsing, and safe conversions.

### Domain contracts and data

- `types/`
  - Canonical TypeScript domain types and enums.
- `constants/`
  - Shared constants, queue defaults, and theme values.
- `data/`
  - Exercise catalog JSON plus bundled seed-program fixtures.

### Tests

- `__tests__/`
  - Unit and contract coverage for queue behavior, db behavior, Coach safeguards, catalog/program invariants, and utility logic.

## Key runtime flows

### Program management

- Programs are created/edited from [app/(tabs)/Programs.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/(tabs)/Programs.tsx).
- The screen delegates workflow state to [hooks/use-programs-screen.ts](/C:/Users/Shane/ShanesGymApp/GymApp/hooks/use-programs-screen.ts).
- Persistence goes through [services/database.ts](/C:/Users/Shane/ShanesGymApp/GymApp/services/database.ts) and then into `services/db/*`.

### Active workout flow

- [app/(tabs)/ActiveWorkout.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/(tabs)/ActiveWorkout.tsx) uses [hooks/use-active-workout.ts](/C:/Users/Shane/ShanesGymApp/GymApp/hooks/use-active-workout.ts).
- Queue loading, workout saving, timer cleanup, and progression all end up in the database/db modules.

### Coach flow

- [app/(tabs)/Coach.tsx](/C:/Users/Shane/ShanesGymApp/GymApp/app/(tabs)/Coach.tsx) remains the route entry point.
- Proxy transport lives in [services/coach/proxy-client.ts](/C:/Users/Shane/ShanesGymApp/GymApp/services/coach/proxy-client.ts).
- Prompt suite constants live in [services/coach/test-prompts.ts](/C:/Users/Shane/ShanesGymApp/GymApp/services/coach/test-prompts.ts).
- Deterministic queue parsing/repair still relies on [services/workout-queue-modifier.ts](/C:/Users/Shane/ShanesGymApp/GymApp/services/workout-queue-modifier.ts) plus `services/queue/*`.
- Generated program preview and queue preview UI were split into `components/coach/*`.

## Commands

```bash
npm install
npm run start
npm run android
npm run lint
npm run typecheck
npm run test
npm run test -- --ci --runInBand
```

## Validation baseline

Current refactor validation baseline:
- `npm run lint`
- `npm run typecheck`
- `npm run test -- --ci --runInBand`

At the time of the refactor handoff this baseline was green with:
- `40` test suites passing
- `930` tests passing

## Notes

- Workout and profile data are offline-first via SQLite.
- Coach requests depend on a configured backend proxy URL in app config/env.
- Queue safety is deterministic: model output is never trusted without parsing, repair, diffing, and validation.
- The repo uses Expo Router, so navigation behavior is driven by the `app/` file tree rather than a manually declared route map.
