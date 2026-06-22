import { Stack } from 'expo-router';
import AppGuideScreen from '@/screens/AppGuideScreen';

export default function AppGuidePage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppGuideScreen />
    </>
  );
}
