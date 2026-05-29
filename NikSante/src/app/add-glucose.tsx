import { Redirect } from 'expo-router';

// Redirige /add-glucose → /(tabs)/add-glucose (route canonique)
export default function AddGlucoseRedirect() {
  return <Redirect href="/(tabs)/add-glucose" />;
}
