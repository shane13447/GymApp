/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log error to console (in production, you'd send this to an error tracking service)
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <ThemedView style={styles.container}>
          <View style={styles.content}>
            <ThemedText type="title" style={styles.title}>
              Oops! Something went wrong
            </ThemedText>
            <ThemedText style={styles.message}>
              We're sorry, but something unexpected happened. Please try again.
            </ThemedText>
            {__DEV__ && error && (
              <View style={styles.errorDetails}>
                <ThemedText style={styles.errorTitle}>Error Details:</ThemedText>
                <ThemedText style={styles.errorMessage}>{error.message}</ThemedText>
              </View>
            )}
            <Pressable onPress={this.handleRetry} style={styles.button}>
              {({ pressed }) => (
                <View
                  style={[
                    styles.buttonInner,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <ThemedText style={styles.buttonText}>Try Again</ThemedText>
                </View>
              )}
            </Pressable>
          </View>
        </ThemedView>
      );
    }

    return children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
  },
  errorDetails: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  errorTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#c62828',
  },
  errorMessage: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#c62828',
  },
  button: {
    minWidth: 150,
  },
  buttonInner: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ErrorBoundary;
