import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../theme';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}

export default function EmptyState({ icon = 'folder-open-outline', title, message }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={Colors.textTertiary} />
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.md,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
