import { Redirect } from 'expo-router';
export default function HeartRateRedirect() {
  return <Redirect href={'/(tabs)/sleep' as any} />;
}
