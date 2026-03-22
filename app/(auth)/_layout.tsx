import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: '戻る',
        headerStyle: { backgroundColor: '#f5f7fb' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#f5f7fb' },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'ログイン' }} />
      <Stack.Screen name="join" options={{ title: '大会に参加' }} />
    </Stack>
  );
}
