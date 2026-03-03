/**
 * Confirm Dialog Component
 * A reusable confirmation dialog using Alert
 */

import { Alert } from 'react-native';

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

/**
 * Show a confirmation dialog
 */
export function showConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogOptions): void {
  Alert.alert(
    title,
    message,
    [
      {
        text: cancelText,
        style: 'cancel',
        onPress: onCancel,
      },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ],
    { cancelable: true }
  );
}

/**
 * Show a delete confirmation dialog
 */
export function showDeleteConfirmation(itemName: string, onConfirm: () => void): void {
  showConfirmDialog({
    title: 'Delete Confirmation',
    message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
    confirmText: 'Delete',
    destructive: true,
    onConfirm,
  });
}

/**
 * Show a discard changes confirmation dialog
 */
export function showDiscardChangesConfirmation(onConfirm: () => void): void {
  showConfirmDialog({
    title: 'Discard Changes?',
    message: 'You have unsaved changes. Are you sure you want to discard them?',
    confirmText: 'Discard',
    destructive: true,
    onConfirm,
  });
}

export default showConfirmDialog;
