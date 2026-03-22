import { Stack } from 'expo-router';

export default function TournamentSlugLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="team/[teamId]" />
    </Stack>
  );
}
