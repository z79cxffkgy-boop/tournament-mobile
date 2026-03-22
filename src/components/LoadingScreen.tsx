import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Colors, FontSize } from '../theme';

interface Props {
  message?: string;
}

export default function LoadingScreen({ message }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {message && <Text style={styles.text}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: 12,
  },
  text: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
});
