import { Redirect } from 'expo-router';

// Ancienne page template Expo — redirige vers le dashboard
export default function ExploreRedirect() {
  return <Redirect href="/(tabs)/dashboard" />;
}
