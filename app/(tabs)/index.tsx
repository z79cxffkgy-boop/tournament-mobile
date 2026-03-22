import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../../src/theme';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/store/auth';
import LoadingScreen from '../../src/components/LoadingScreen';
import EmptyState from '../../src/components/EmptyState';

interface Tournament {
  id: number;
  name: string;
  description?: string | null;
  public_slug: string;
  invite_code?: string | null;
  is_published: boolean;
  date?: string | null;
  venue?: string | null;
  cover_image_url?: string | null;
}

export default function DashboardTab() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isHost = user?.role === 'host';

  const fetchData = useCallback(async () => {
    if (!isHost) return;
    try {
      const data = await apiFetch('/hosts/me/tournaments');
      setTournaments(data);
    } catch {
      setTournaments([]);
    }
  }, [isHost]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleDelete = (slug: string, name: string) => {
    Alert.alert(
      '大会を削除',
      `「${name}」を削除しますか？この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/tournaments/${slug}`, { method: 'DELETE' });
              setTournaments((prev) =>
                prev.filter((t) => t.public_slug !== slug),
              );
            } catch {
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ],
    );
  };

  if (!isAuthenticated || !isHost) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>管理</Text>
        </View>
        <EmptyState
          icon="lock-closed-outline"
          title="ホストとしてログインしてください"
          message="大会を管理するにはホストアカウントでログインが必要です。"
        />
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginBtnText}>ログイン</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (loading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>管理</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/tournament/new')}
        >
          <Ionicons name="add" size={24} color={Colors.textInverse} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={tournaments}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={
          tournaments.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <EmptyState
            icon="trophy-outline"
            title="大会がまだありません"
            message="右上の＋ボタンから新しい大会を作成しましょう。"
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/tournament/${item.public_slug}`)}
          >
            <View style={styles.cardRow}>
              {item.cover_image_url ? (
                <Image source={{ uri: item.cover_image_url }} style={styles.thumb} />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Ionicons name="trophy" size={24} color={Colors.primary} />
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.cardBadges}>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: item.is_published
                          ? Colors.successLight
                          : Colors.warningLight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: item.is_published
                            ? Colors.success
                            : Colors.warning,
                        },
                      ]}
                    >
                      {item.is_published ? '公開中' : '非公開'}
                    </Text>
                  </View>
                  {item.invite_code && (
                    <Text style={styles.codeText}>
                      コード: {item.invite_code}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item.public_slug, item.name)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={Colors.error}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    margin: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  loginBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  list: {
    paddingBottom: Spacing.xxxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    padding: Spacing.lg,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  thumb: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.sm,
  },
  thumbPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  cardName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  cardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  codeText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
});
