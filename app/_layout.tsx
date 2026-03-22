import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../src/store/auth';
import { useAuthProvider } from '../src/hooks/useAuth';

export default function RootLayout() {
  const auth = useAuthProvider();

  return (
    <AuthContext.Provider value={auth}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#f5f7fb' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="tournament/[slug]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="tournament/new"
          options={{
            headerShown: true,
            title: '新規大会作成',
            headerBackTitle: '戻る',
            presentation: 'modal',
          }}
        />
      </Stack>
    </AuthContext.Provider>
  );
}
