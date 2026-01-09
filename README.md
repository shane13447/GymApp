# Shane's Gym App

A comprehensive React Native gym tracking app built with Expo that helps you create workout programs, track your progress, and get AI-powered workout modifications using on-device machine learning.

## Features

- **Workout Program Management**: Create and manage multi-day workout programs with custom exercises
- **Active Workout Tracking**: Log your workouts in real-time with weight, reps, and sets tracking
- **Workout History**: View and analyze your completed workouts organized by date
- **AI-Powered Coach**: Get intelligent workout modifications using on-device LLM (Llama 3.2 3B via Executorch)
- **Automatic Workout Queue**: Maintains a queue of 3 upcoming workouts with automatic progression
- **Auto-Weight Progression**: Automatically increases weights based on your last logged performance
- **Dark/Light Mode**: Full theme support with system preference detection
- **Offline-First**: All data stored locally using SQLite - no internet required

## Tech Stack

### Core Technologies
- **React Native 0.81.5** with **Expo ~54.0.20**
- **TypeScript 5.9.2** (Strict mode enabled)
- **Expo Router ~6.0.13** (File-based routing)
- **NativeWind 4.2.1** (Tailwind CSS for React Native)
- **SQLite** (expo-sqlite) - Local database persistence

### AI/ML Integration
- **react-native-executorch 0.5.15** - On-device LLM execution
- **Llama 3.2 3B QLoRA** - Language model for workout modifications
- Configured with 8k context window, 32 token batch size

### Key Libraries
- `@react-navigation/bottom-tabs` - Tab navigation
- `react-native-reanimated` - Smooth animations
- `expo-haptics` - Tactile feedback
- `expo-symbols` - SF Symbols icons
- `clsx`, `tailwind-merge` - Utility functions

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd GymApp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   # or
   npx expo start
   ```

4. **Run on android**
   ```bash
   npm run android    # Android emulator
   ```

## App Structure

### Navigation
The app uses tab-based navigation with the following screens:
- **Home** - Dashboard with stats and quick actions
- **Programs** - Create and manage workout programs (3-step wizard)
- **Coach** - AI-powered workout modifications and motivational chat
- **History** - View completed workouts
- **Profile** - User settings and preferences
- **ActiveWorkout** - Hidden tab for logging active workouts (accessed via navigation)

### Key Screens

#### Programs Screen
- **3-Step Creation Wizard**:
  1. Basic Info - Program name and number of workout days
  2. Exercise Selection - Choose exercises from 36 available exercises
  3. Configuration - Set weight, reps, sets, rest time, and progression for each exercise

#### Coach Screen
- **AI Workout Modifications**: Request changes to your workout queue
- **IronLogic Engine**: Processes modifications using TOON (Token Optimized Object Notation)
- **Post-LLM Repair System**: Automatically fixes common LLM output errors

#### ActiveWorkout Screen
- Real-time workout logging
- Exercise-by-exercise tracking
- Auto-progression suggestions based on last logged weight

## Project Structure

```
GymApp/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout (ThemeProvider, ErrorBoundary)
│   ├── index.tsx                 # Entry point → redirects to Home
│   ├── modal.tsx                 # Modal screen
│   └── (tabs)/                   # Tab navigation group
│       ├── _layout.tsx           # Tab bar configuration
│       ├── Home.tsx              # Dashboard
│       ├── Programs.tsx          # Program CRUD
│       ├── Coach.tsx             # AI coach
│       ├── ActiveWorkout.tsx     # Log workout session
│       ├── History.tsx           # View completed workouts
│       └── Profile.tsx           # User settings
├── components/
│   ├── programs/                 # Program-related components
│   ├── workout/                  # Workout-related components
│   ├── ui/                       # Reusable UI components
│   └── nativewindui/             # NativeWind UI primitives
├── services/
│   ├── database.ts               # SQLite database operations
│   └── workout-queue-modifier.ts # AI workout modification logic
├── types/
│   └── index.ts                  # TypeScript interfaces & enums
├── constants/
│   ├── index.ts                  # App constants & defaults
│   └── theme.ts                  # Colors, fonts, spacing
├── lib/
│   ├── utils.ts                  # Utility functions (cn)
│   └── validation.ts             # Form validation functions
├── data/
│   └── exerciseSelection.json    # 36 exercises with muscle groups
└── __tests__/                    # Jest unit tests
```

## Database Schema

The app uses SQLite with the following tables:

- `user_preferences` - Current program, weight unit, theme, etc.
- `programs` - Workout programs
- `workout_days` - Days within programs (FK: programs)
- `program_exercises` - Exercises within days (FK: workout_days)
- `workouts` - Completed workout sessions
- `workout_exercises` - Logged exercises (FK: workouts)
- `workout_queue` - Upcoming workouts queue
- `queue_exercises` - Exercises in queued workouts (FK: workout_queue)

## AI Coach System - IronLogic Engine

### Overview
The AI Coach uses "IronLogic", a Gym Coaching Engine that processes workout modifications using 
**TOON (Token Optimized Object Notation)** - a highly compressed pipe-delimited format optimized for LLM token efficiency.
The exercises field is exempt from this compression as the LLM is much more likely to hallucinate when exercise names are abbreviated.

### TOON Syntax

```
QUEUE STRUCTURE:
Q0:D<day>:exercises;Q1:D<day>:exercises;Q2:D<day>:exercises

EXERCISE FORMAT:
name|kg|reps|sets

DELIMITERS:
|  = field separator (between name, kg, reps, sets)
,  = exercise separator (between exercises in same queue item)
;  = queue item separator (between Q0, Q1, Q2)
:  = queue metadata separator (Q0:D1:...)
```

### Example TOON Queue
```
Q0:D2:Decline Crunches|10|8|3,Leg Extensions|5|12|3;Q1:D3:Barbell Deadlift|20|5|3
```

### Queue Repair System
The repair system fixes common LLM output errors deterministically:
- **Restore Dropped Exercises**: Safety net that restores exercises dropped by LLM unless explicitly removed
- **Column Enforcement**: Fixes changes applied to wrong columns
- **Fuzzy Matching**: Maps LLM hallucinations to real exercises

## Workout Queue System

1. **Queue always maintains 3 upcoming workouts** (Q0, Q1, Q2), This may be changed in future
2. **Auto-generated** when setting a current program
3. **First program auto-set as current** when creating the first program
4. **Auto-progression**: Weights automatically increase based on last logged + progression amount
5. **Completing a workout**: Removes first item, adds new one at end
6. **AI modifications**: Coach screen can modify queue via natural language requests

## Exercise Database

The app includes **36 exercises** organized by:
- Equipment type: Barbell, Dumbbell, Cable, Machine, Bodyweight
- Muscle groups: chest, back, shoulders, biceps, triceps, forearms, quads, glutes, hamstrings, calves, abs, lats, traps

Examples:
- **Barbell**: Back Squat, Bench Press, Deadlift, Row, Shrugs, Hip Thrust
- **Dumbbell**: Arnold Press, Flyes, Lateral Raise, Hammer Curls, Skullcrushers
- **Cable**: Triceps Pushdown, Triangle Rows, Fingertip Curls
- **Machine/Bodyweight**: Leg Press, Leg Extensions, Lat Pulldowns, Pull-Ups

## Testing

### Test Framework
- **Jest 29.7.0** - Unit testing framework
- **ts-jest** - TypeScript support

### Running Tests
```bash
npm run test           # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

### Test Coverage
Tests cover:
- `lib/validation.ts` - Program/exercise validation, weight/reps parsing
- `lib/utils.ts` - Tailwind class merging utility (cn)
- `services/workout-queue-modifier.ts` - Queue encoding, parsing, repair functions

## Development Commands

```bash
npm start              # Start Expo dev server
npm run android        # Run on Android emulator
npm run ios            # Run on iOS simulator, this is unlikely to work
npm run web            # Run on web, this is unlikely to work
npm run lint           # Run ESLint
npm run test           # Run Jest unit tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

## Key Constants

- `DEFAULT_QUEUE_SIZE = 3`
- `DEFAULT_REST_TIME = '180'` (seconds)
- `DEFAULT_SETS = '3'`
- `DEFAULT_REPS = '8'`
- `MAX_PROGRAM_NAME_LENGTH = 100`
- `MAX_WORKOUT_DAYS = 7`
- `MIN_WORKOUT_DAYS = 1`
- `MAX_EXERCISES_PER_DAY = 20`

## Styling Guidelines

- **NativeWind (Tailwind)** for most styling: `className="bg-blue-500 p-4 rounded-full"`
- **StyleSheet** for complex/animated styles


## Important Notes

1. **Use SQLite, not AsyncStorage** - The app migrated from AsyncStorage to SQLite
2. **IronLogic uses TOON format** - Maintain pipe-delimited syntax: `name|kg|reps|sets`
3. **Preserve TOON delimiters** - `|` for fields, `,` for exercises, `;` for queue items
4. **Keep queue at 3 items** - The system expects exactly 3 queue items (Q0, Q1, Q2)
5. **Auto-progression** - Weight auto-increments based on `progression` field
6. **Hidden ActiveWorkout tab** - Users navigate to it, it's not in tab bar
7. **TypeScript strict mode** - All code must be type-safe
8. **Error boundaries** - App wrapped in ErrorBoundary component


