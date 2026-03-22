import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../../src/theme';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/store/auth';

export default function NewTournamentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('入力エラー', '大会名を入力してください');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, any> = { name: name.trim() };
      if (description.trim()) body.description = description.trim();
      if (date.trim()) body.date = date.trim();
      if (venue.trim()) body.venue = venue.trim();

      const data = await apiFetch('/hosts/me/tournaments', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      Alert.alert('作成完了', `大会「${name}」を作成しました`, [
        {
          text: 'OK',
          onPress: () => {
            if (data.public_slug) {
              router.replace(`/tournament/${data.public_slug}`);
            } else {
              router.back();
            }
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('エラー', err.message || '大会の作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  if (user?.role !== 'host') {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.lockText}>
            大会を作成するにはホストとしてログインしてください
          </Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginBtnText}>ログイン</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.label}>大会名 *</Text>
          <TextInput
            style={styles.input}
            placeholder="例: 春季サッカー大会"
            placeholderTextColor={Colors.textTertiary}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>説明</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="大会の説明を入力（任意）"
            placeholderTextColor={Colors.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>開催日</Text>
          <TextInput
            style={styles.input}
            placeholder="例: 2026-04-15"
            placeholderTextColor={Colors.textTertiary}
            value={date}
            onChangeText={setDate}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>会場</Text>
          <TextInput
            style={styles.input}
            placeholder="例: 市民スタジアム"
            placeholderTextColor={Colors.textTertiary}
            value={venue}
            onChangeText={setVenue}
          />
        </View>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={handleCreate}
          disabled={creating}
        >
          <Ionicons name="add-circle-outline" size={20} color={Colors.textInverse} />
          <Text style={styles.createBtnText}>
            {creating ? '作成中...' : '大会を作成'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    padding: Spacing.xxxl,
  },
  lockText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  loginBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  field: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  textArea: {
    minHeight: 100,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  createBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});
