import { Stack } from 'expo-router';
import DiabetesGuideScreen from '@/screens/DiabetesGuideScreen';

export default function DiabetesGuidePage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DiabetesGuideScreen />
    </>
  );
}
