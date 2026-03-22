import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { Colors, FontSize, Spacing } from '../../src/theme';

// The join functionality is integrated into the Search tab.
// This route redirects there.
export default function JoinScreen() {
  return <Redirect href="/(tabs)/search" />;
}
