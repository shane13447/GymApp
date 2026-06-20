import type { ReactElement } from 'react';
import { Redirect } from 'expo-router';

/**
 * Root index route that immediately redirects to the Home tab.
 *
 * @returns {ReactElement} A redirect to the Home tab screen.
 */
export default function Index(): ReactElement {
  return <Redirect href="/(tabs)/Home" />;
}
