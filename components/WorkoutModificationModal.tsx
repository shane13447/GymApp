import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import type { ProposedChanges } from '@/services/workout-queue-modifier';

interface WorkoutModificationModalProps {
  visible: boolean;
  proposedChanges: ProposedChanges | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function WorkoutModificationModal({
  visible,
  proposedChanges,
  onConfirm,
  onCancel,
}: WorkoutModificationModalProps) {
  if (!proposedChanges) return null;

  const hasChanges =
    proposedChanges.weightChanges.length > 0 ||
    proposedChanges.removals.length > 0 ||
    proposedChanges.additions.length > 0 ||
    proposedChanges.swaps.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <ThemedView 
          style={styles.modalContainer}
          lightColor="#fff"
          darkColor="#1e1e1e"
        >
          <ThemedText type="title" style={styles.title}>
            Review Proposed Changes
          </ThemedText>

          {!hasChanges ? (
            <ThemedView style={styles.noChangesContainer}>
              <ThemedText style={styles.noChangesText}>
                No changes were proposed.
              </ThemedText>
            </ThemedView>
          ) : (
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>
              {/* Weight Changes */}
              {proposedChanges.weightChanges.length > 0 && (
                <ThemedView style={styles.section}>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Weight Changes ({proposedChanges.weightChanges.length})
                  </ThemedText>
                  {proposedChanges.weightChanges.map((change, index) => (
                    <ThemedView 
                      key={index} 
                      style={styles.changeItem}
                      lightColor="#f5f5f5"
                      darkColor="#2a2a2a"
                    >
                      <ThemedText style={styles.exerciseName}>
                        {change.exerciseName}
                      </ThemedText>
                      <ThemedText style={styles.queueInfo}>
                        {change.queueItemName} - Day {change.dayNumber}
                      </ThemedText>
                      <View style={styles.weightChangeRow}>
                        <ThemedText style={styles.weightLabel}>Old:</ThemedText>
                        <ThemedText style={styles.oldWeight}>{change.oldWeight}</ThemedText>
                        <ThemedText style={styles.arrow}>→</ThemedText>
                        <ThemedText style={styles.weightLabel}>New:</ThemedText>
                        <ThemedText style={styles.newWeight}>{change.newWeight}</ThemedText>
                      </View>
                    </ThemedView>
                  ))}
                </ThemedView>
              )}

              {/* Removals */}
              {proposedChanges.removals.length > 0 && (
                <ThemedView style={styles.section}>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Exercises to Remove ({proposedChanges.removals.length})
                  </ThemedText>
                  {proposedChanges.removals.map((removal, index) => (
                    <ThemedView 
                      key={index} 
                      style={styles.changeItem}
                      lightColor="#f5f5f5"
                      darkColor="#2a2a2a"
                    >
                      <ThemedText style={styles.exerciseName}>
                        {removal.exerciseName}
                      </ThemedText>
                      <ThemedText style={styles.queueInfo}>
                        {removal.queueItemName} - Day {removal.dayNumber}
                      </ThemedText>
                      <View style={styles.removalBadge}>
                        <ThemedText style={styles.removalText}>
                          Removing (muscle group: {removal.muscleGroup})
                        </ThemedText>
                      </View>
                    </ThemedView>
                  ))}
                </ThemedView>
              )}

              {/* Additions */}
              {proposedChanges.additions.length > 0 && (
                <ThemedView style={styles.section}>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Exercises to Add ({proposedChanges.additions.length})
                  </ThemedText>
                  {proposedChanges.additions.map((addition, index) => (
                    <ThemedView 
                      key={index} 
                      style={styles.changeItem}
                      lightColor="#e8f5e9"
                      darkColor="#1b5e20"
                    >
                      <ThemedText style={styles.exerciseName}>
                        {addition.exerciseName}
                      </ThemedText>
                      <ThemedText style={styles.queueInfo}>
                        {addition.queueItemName} - Day {addition.dayNumber}
                      </ThemedText>
                      <View style={styles.additionDetails}>
                        <ThemedText style={styles.detailText}>
                          Equipment: {addition.equipment}
                        </ThemedText>
                        <ThemedText style={styles.detailText}>
                          Sets: {addition.sets} | Reps: {addition.reps} | Weight: {addition.weight}
                        </ThemedText>
                        <View style={styles.muscleGroupContainer}>
                          {addition.muscle_groups_worked.map((group, idx) => (
                            <View key={idx} style={styles.muscleGroupBadge}>
                              <ThemedText style={styles.muscleGroupText}>{group}</ThemedText>
                            </View>
                          ))}
                        </View>
                      </View>
                    </ThemedView>
                  ))}
                </ThemedView>
              )}

              {/* Swaps */}
              {proposedChanges.swaps.length > 0 && (
                <ThemedView style={styles.section}>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Exercise Swaps ({proposedChanges.swaps.length})
                  </ThemedText>
                  {proposedChanges.swaps.map((swap, index) => (
                    <ThemedView 
                      key={index} 
                      style={styles.changeItem}
                      lightColor="#fff3e0"
                      darkColor="#e65100"
                    >
                      <ThemedText style={styles.exerciseName}>
                        {swap.oldExerciseName}
                      </ThemedText>
                      <ThemedText style={styles.queueInfo}>
                        {swap.queueItemName} - Day {swap.dayNumber}
                      </ThemedText>
                      <View style={styles.swapRow}>
                        <ThemedText style={styles.swapLabel}>Swapping:</ThemedText>
                        <ThemedText style={styles.oldExercise}>{swap.oldExerciseName}</ThemedText>
                        <ThemedText style={styles.arrow}>→</ThemedText>
                        <ThemedText style={styles.newExercise}>{swap.newExerciseName}</ThemedText>
                      </View>
                    </ThemedView>
                  ))}
                </ThemedView>
              )}
            </ScrollView>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={!hasChanges}
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                pressed && styles.buttonPressed,
                !hasChanges && styles.buttonDisabled,
              ]}
            >
              <ThemedText style={styles.confirmButtonText}>Confirm Changes</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  scrollView: {
    maxHeight: 400,
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: 'bold',
  },
  changeItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  queueInfo: {
    fontSize: 12,
    marginBottom: 8,
    opacity: 0.7,
  },
  weightChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weightLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  oldWeight: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  arrow: {
    fontSize: 16,
    color: '#007AFF',
    marginHorizontal: 4,
  },
  newWeight: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  removalBadge: {
    backgroundColor: '#ffebee',
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  removalText: {
    fontSize: 12,
    color: '#c62828',
  },
  additionDetails: {
    marginTop: 8,
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    opacity: 0.8,
  },
  muscleGroupContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  muscleGroupBadge: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  muscleGroupText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  swapLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  oldExercise: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  newExercise: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff9800',
  },
  noChangesContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noChangesText: {
    fontSize: 16,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#e0e0e0',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

