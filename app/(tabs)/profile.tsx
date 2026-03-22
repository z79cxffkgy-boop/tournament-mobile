import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../../src/theme';
import { useAuth } from '../../src/store/auth';

export default function ProfileTab() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const roleLabel = (role: string | null) => {
    switch (role) {
      case 'host':
        return 'ホスト';
      case 'captain':
        return 'キャプテン';
      case 'guest':
        return 'ゲスト';
      default:
        return '未ログイン';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headerTitle}>マイページ</Text>

        {isAuthenticated && user ? (
          <>
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={32} color={Colors.primary} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.displayName}>
                  {user.displayName || '名前未設定'}
                </Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>
                    {roleLabel(user.role)}
                  </Text>
                </View>
              </View>
            </View>

            {user.tournamentName && (
              <View style={styles.infoCard}>
                <Ionicons
                  name="trophy-outline"
                  size={20}
                  color={Colors.primary}
                />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>参加中の大会</Text>
                  <Text style={styles.infoValue}>{user.tournamentName}</Text>
                </View>
              </View>
            )}

            {user.teamName && (
              <View style={styles.infoCard}>
                <Ionicons
                  name="shield-outline"
                  size={20}
                  color={Colors.primary}
                />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>チーム</Text>
                  <Text style={styles.infoValue}>{user.teamName}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.error} />
              <Text style={styles.logoutText}>ログアウト</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.authSection}>
            <Text style={styles.authMessage}>
              ログインすると大会の管理や参加ができます
            </Text>
            <TouchableOpacity
              style={styles.authBtn}
              onPress={() => router.push('/(auth)/login')}
            >
              <Ionicons
                name="log-in-outline"
                size={20}
                color={Colors.textInverse}
              />
              <Text style={styles.authBtnText}>ホストとしてログイン</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.joinAuthBtn}
              onPress={() => router.push('/(auth)/join')}
            >
              <Ionicons
                name="enter-outline"
                size={20}
                color={Colors.primary}
              />
              <Text style={styles.joinAuthBtnText}>招待コードで参加</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>TournamentFlow v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  displayName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(37,99,235,0.08)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  roleText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  infoContent: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  logoutText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.error,
  },
  authSection: {
    gap: Spacing.lg,
    marginTop: Spacing.xl,
  },
  authMessage: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  authBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  authBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  joinAuthBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  joinAuthBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  appInfo: {
    marginTop: Spacing.xxxl,
    alignItems: 'center',
  },
  appInfoText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
});
