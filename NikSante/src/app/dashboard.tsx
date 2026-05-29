import { Redirect } from 'expo-router';

// Redirige /dashboard → /(tabs)/dashboard (route canonique)
export default function DashboardRedirect() {
  return <Redirect href="/(tabs)/dashboard" />;
}
