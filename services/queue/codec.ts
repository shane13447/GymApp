/**
 * Queue codec module — TOON encoding, weight rounding, and prompt building.
 *
 * This module owns the translate layer between WorkoutQueueItem objects
 * and the compressed TOON format consumed by the LLM. All functions are
 * pure or depend only on deterministic data, making them safe for
 * strict-zone parity testing.
 */

import { getExerciseVariantLabel } from '@/lib/utils';
import type { ExerciseVariant, ProgramExercise, WorkoutQueueItem } from '@/types';

import type { CustomisedSetPayloadInput } from './types';

// =============================================================================
// WEIGHT ROUNDING
// =============================================================================

/**
 * Rounds a weight to the nearest 0.5 kg increment.
 * Example: 82.74 → 82.5, 82.76 → 83.0
 *
 * Used only in the coach modify-workout queue flow.
 * Does NOT apply to manual program creation, ActiveWorkout logging, or history.
 */
export const roundWeightToNearestHalfKg = (weight: number | string): string => {
  const numericWeight = typeof weight === 'string' ? parseFloat(weight) : weight;
  if (isNaN(numericWeight)) {
    return String(weight);
  }
  // Round to nearest 0.5: multiply by 2, round, divide by 2
  const rounded = Math.round(numericWeight * 2) / 2;
  return rounded.toFixed(1);
};

/**
 * Checks if rounding should be applied for a given modification context.
 * Only applies to coach-initiated queue modifications.
 */
export const isCoachQueueModification = (_context?: string): boolean => {
  // Always round when called from coach flow
  return true;
};

/**
 * Normalises a single coach-modified weight to nearest 0.5 kg.
 */
export const normalizeCoachModifiedWeight = (weight: string): string => {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight)) {
    return weight;
  }

  return (Math.round(numericWeight * 2) / 2).toFixed(1);
};

/**
 * Rounds all coach-modified weights in a parsed queue to nearest 0.5 kg,
 * preserving weights that are unchanged from the original.
 */
export const roundCoachModifiedQueueWeights = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[]
): WorkoutQueueItem[] => {
  return parsedQueue.map((parsedItem, itemIndex) => {
    const originalItem = originalQueue.find((item) => item.id === parsedItem.id) ?? originalQueue[itemIndex];

    return {
      ...parsedItem,
      exercises: parsedItem.exercises.map((exercise, exerciseIndex) => {
        const originalExercise =
          originalItem?.exercises.find(
            (candidate) =>
              candidate.exerciseInstanceId &&
              exercise.exerciseInstanceId &&
              candidate.exerciseInstanceId === exercise.exerciseInstanceId
          ) ?? originalItem?.exercises[exerciseIndex];

        if (!originalExercise) {
          return {
            ...exercise,
            weight: normalizeCoachModifiedWeight(exercise.weight),
          };
        }

        if (exercise.weight === originalExercise.weight) {
          return exercise;
        }

        return {
          ...exercise,
          weight: normalizeCoachModifiedWeight(exercise.weight),
        };
      }),
    };
  });
};

// =============================================================================
// CUSTOMISED SET PAYLOAD
// =============================================================================

/**
 * Normalises a customised-set payload, filling missing arrays when
 * customised sets are disabled and validating array-length consistency
 * when enabled.
 */
export const normalizeCustomisedSetPayload = (payload: CustomisedSetPayloadInput): CustomisedSetPayloadInput => {
  if (!payload.hasCustomisedSets) {
    return {
      ...payload,
      repsBySet: payload.repsBySet ?? [],
      weightBySet: payload.weightBySet ?? [],
    };
  }

  const repsBySet = payload.repsBySet ?? [];
  const weightBySet = payload.weightBySet ?? [];

  if (repsBySet.length === 0 || weightBySet.length === 0 || repsBySet.length !== weightBySet.length) {
    throw new Error('Invalid customised set payload');
  }

  return {
    ...payload,
    repsBySet,
    weightBySet,
  };
};

// =============================================================================
// TOON ENCODING
// =============================================================================

/**
 * Serialises an exercise variant into the compact pipe-delimited format
 * used inside TOON exercise rows. Returns empty string when no variant.
 */
const serialiseVariantForPrompt = (variant?: ExerciseVariant | null): string => {
  const label = getExerciseVariantLabel(variant).trim();
  if (!label) {
    return '';
  }

  return label.replace(/,/g, '/');
};

/**
 * IronLogic System Prompt — TOON (Token Optimized Object Notation) Format.
 *
 * Instructs the LLM to act as a gym coaching engine that modifies workout
 * queues using a highly compressed pipe-delimited format.
 */
export const COMPRESSED_SYSTEM_PROMPT = `<role>
IronLogic: Gym Queue Modifier. Output TOON only. No text.
</role>

<format>
QUEUE: Q0:D<day>:exercises;Q1:D<day>:exercises;Q2:D<day>:exercises
EXERCISE: name|kg|reps|sets|variant
Columns: 1=name 2=kg 3=reps 4=sets 5=variant(optional)
</format>

<critical>
- COPY ALL exercises from input (except removals)
- COPY ALL Q items (Q0;Q1;Q2)
- Change ONLY the column requested:
  * "weight" = column 2 (kg)
  * "reps" = column 3
  * "sets" = column 4
  * "variant" = column 5
- For variants: keep column 1 as base exercise name only.
- Do NOT embed variant in column 1 when column 5 is present.
- If variant appears in both column 1 and column 5, both must be identical.
- Preserve exact values in unchanged columns.
- Sets are deterministic. If canonical reps[] and weight[] arrays are provided upstream, set column 4 to array length.
- Canonical conversion rule: kg=weight[0], reps=reps[0], sets=array length (reps[] and weight[] lengths must match).
</critical>

<structural_rules>
- Explicit structural requests (add/remove) are mandatory intent constraints.
- "add" requests must increase target count for each targeted exercise by at least +1.
- "remove" requests must decrease target count for each targeted exercise by at least -1.
- Structural operations must be target-scoped. Do not remove unrelated exercises.
- Structural operations must preserve non-targeted exercises and queue items exactly.
- When add/remove appears with variant terms (e.g., "add neutral grip"), treat this as variant intent unless the prompt explicitly asks for a new exercise instance.
</structural_rules>

<injury_policy>
- mild: lighten all affected exercises across the entire current queue using a weight-first rule (reduce kg first, then reps/sets if needed)
- moderate: swap all affected exercises across the entire current queue to safer similar alternatives or remove them
- severe: same swap-or-remove rule across the entire current queue, with removal as fallback when no suitable safer alternative exists
- infer severity from user language when unspecified
- avoid positional assumptions; evaluate and modify the entire current queue
</injury_policy>

<examples>
IN: Q0:D1:Barbell Bench Press|92.5|5|3|Flat,Chest Press|74|11|3|Incline;Q1:D2:Decline Crunches|25|20|4|Decline,Lat Pulldowns|67|8|4|Wide Grip
REQ: change barbell bench press weight to 95
OUT: Q0:D1:Barbell Bench Press|95|5|3|Flat,Chest Press|74|11|3|Incline;Q1:D2:Decline Crunches|25|20|4|Decline,Lat Pulldowns|67|8|4|Wide Grip

IN: canonical row upstream reps[]=[5,5,5,5] weight[]=[92.5,92.5,92.5,92.5]
REQ: convert to TOON row deterministically
OUT: Q0:D1:Barbell Bench Press|92.5|5|4|Flat

IN: Q0:D1:Barbell Bench Press|92.5|5|5|Flat,Overhead Barbell Press|47.5|6|4|Standing;Q1:D2:Lat Pulldowns|67|8|4|Wide Grip
REQ: mild shoulder irritation, go easier on pressing
OUT: Q0:D1:Barbell Bench Press|85|5|5|Flat,Overhead Barbell Press|40|6|4|Standing;Q1:D2:Lat Pulldowns|67|8|4|Wide Grip

IN: Q0:D1:Barbell Back Squat|117.5|4|5|High Bar,Leg Extensions|55|15|3|Seated,Calf Press|160|12|5|Neutral,Barbell Deadlift|135|3|5|Conventional;Q1:D2:Lat Pulldowns|67|8|4|Wide Grip
REQ: my lower back is sore, adjust today so it does not flare up
OUT: Q0:D1:Lat Pulldowns|67|8|4|Wide Grip

IN: Q0:D2:Lat Pulldowns|55|10|3|Wide Grip,Triangle Rows|50|10|3|Close Grip
REQ: switch lat pulldowns and triangle rows to neutral grip
OUT: Q0:D2:Lat Pulldowns|55|10|3|Neutral Grip,Triangle Rows|50|10|3|Neutral Grip

IN: Q0:D2:Hammer Curls|20|9|4|Neutral Grip,Reverse Grip Forearm Curls|12|16|3|Reverse Grip
REQ: add another hammer curls
OUT: Q0:D2:Hammer Curls|20|9|4|Neutral Grip,Reverse Grip Forearm Curls|12|16|3|Reverse Grip,Hammer Curls|20|9|4|Neutral Grip

IN: Q2:D3:Barbell Back Squat|117.5|4|5|High Bar,Leg Extensions|55|15|3|Seated,Barbell Deadlift|135|3|5|Conventional
REQ: remove barbell deadlift from day 3
OUT: Q2:D3:Barbell Back Squat|117.5|4|5|High Bar,Leg Extensions|55|15|3|Seated
</examples>

<task>
Output modified queue. Include ALL exercises and ALL Q items.
</task>`;

/**
 * Encodes a workout queue into the TOON pipe-delimited format
 * for LLM consumption.
 */
export const encodeQueueForLLM = (queue: WorkoutQueueItem[]): string => {
  return queue
    .map((item, queueIndex) => {
      const exercises = item.exercises
        .map((ex) => {
          const variantLabel = serialiseVariantForPrompt(ex.variant);
          const base = `${ex.name}|${ex.weight || '0'}|${ex.reps || '8'}|${ex.sets || '3'}`;
          return variantLabel ? `${base}|${variantLabel}` : base;
        })
        .join(',');
      return `Q${queueIndex}:D${item.dayNumber}:${exercises}`;
    })
    .join(';');
};

/**
 * Builds the compressed prompt string combining the TOON-encoded queue
 * with the user's natural-language request.
 */
export const buildCompressedPrompt = (
  userRequest: string,
  queue: WorkoutQueueItem[]
): string => {
  const encodedQueue = encodeQueueForLLM(queue);
  return `Queue:${encodedQueue}
Request:${userRequest}`;
};