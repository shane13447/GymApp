import type { ReactElement } from 'react';
import { Redirect } from 'expo-router';

export default function Index(): ReactElement {
  return <Redirect href="/(tabs)/Home" />;
}
