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
import { Colors, Spacing, BorderRadius, FontSize } from '../../src/theme';
import { apiFetch, setHostToken } from '../../src/api/client';
import { useAuth } from '../../src/store/auth';

export default function LoginScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!displayName.trim() || !password.trim()) {
      Alert.alert('入力エラー', '全ての項目を入力してください');
      return;
    }
    setLoading(true);
    try {
      const endpoint =
        mode === 'login'
          ? '/auth/host/login'
          : '/auth/host/register';
      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          display_name: displayName.trim(),
          password: password.trim(),
        }),
        skipAuth: true,
      });
      if (data.token) {
        await setHostToken(data.token);
        await refreshUser();
        router.replace('/(tabs)');
      } else {
        Alert.alert('エラー', 'トークンが取得できませんでした');
      }
    } catch (err: any) {
      Alert.alert(
        'エラー',
        err.message || (mode === 'login' ? 'ログインに失敗しました' : '登録に失敗しました'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.activeTab]}
              onPress={() => setMode('login')}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === 'login' && styles.activeTabText,
                ]}
              >
                ログイン
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && styles.activeTab]}
              onPress={() => setMode('signup')}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === 'signup' && styles.activeTabText,
                ]}
              >
                新規登録
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>表示名</Text>
              <TextInput
                style={styles.input}
                placeholder="表示名を入力"
                placeholderTextColor={Colors.textTertiary}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>パスワード</Text>
              <TextInput
                style={styles.input}
                placeholder="パスワードを入力"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitText}>
                {loading
                  ? '処理中...'
                  : mode === 'login'
                    ? 'ログイン'
                    : 'アカウント作成'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  tabs: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: Colors.border,
  },
  activeTab: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.primary,
  },
  form: {
    padding: Spacing.xxl,
    gap: Spacing.lg,
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
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  submitText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
