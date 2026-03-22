import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../../../../src/theme';
import { apiFetch } from '../../../../src/api/client';

interface Player {
  id: number;
  name: string;
  number?: number | null;
}

interface TeamDetail {
  id: number;
  name: string;
  logo_url?: string | null;
  captain_display_name?: string | null;
  players?: Player[];
}

export default function TeamDetailScreen() {
  const { slug, teamId } = useLocalSearchParams<{ slug: string; teamId: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    loadTeamData();
  }, [slug, teamId]);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      // Load tournament init data to get team info
      const data = await apiFetch(`/tournaments/by-slug/${slug}/init-data`);

      const teamIdNum = parseInt(teamId || '0', 10);

      // Find team from init data
      const foundTeam = (data.teams || []).find((t: any) => t.id === teamIdNum);
      if (foundTeam) {
        setTeam({
          id: foundTeam.id,
          name: foundTeam.name,
          logo_url: foundTeam.logo_url,
          captain_display_name: foundTeam.captain_display_name,
          players: foundTeam.players || [],
        });
      }

      // Find matches involving this team
      const teamMatches = (data.matches || []).filter(
        (m: any) => m.home_team_id === teamIdNum || m.away_team_id === teamIdNum,
      );
      const tm = new Map<number, any>(
        (data.teams || []).map((t: any) => [t.id, t]),
      );
      setMatches(
        teamMatches.map((m: any) => ({
          ...m,
          home_team_name: tm.get(m.home_team_id)?.name || 'TBD',
          away_team_name: tm.get(m.away_team_id)?.name || 'TBD',
          home_team_logo: tm.get(m.home_team_id)?.logo_url,
          away_team_logo: tm.get(m.away_team_id)?.logo_url,
        })),
      );
    } catch (e) {
      console.error('Failed to load team data', e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!team) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>チーム</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>チームが見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {team.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Team Profile */}
        <View style={styles.profileSection}>
          {team.logo_url ? (
            <Image source={{ uri: team.logo_url }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamLogoPlaceholder}>
              <Text style={styles.teamLogoText}>
                {team.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.teamName}>{team.name}</Text>
          {team.captain_display_name && (
            <View style={styles.captainRow}>
              <Ionicons name="person-outline" size={14} color={Colors.textTertiary} />
              <Text style={styles.captainText}>{team.captain_display_name}</Text>
            </View>
          )}
        </View>

        {/* Squad Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>選手一覧</Text>
          {team.players && team.players.length > 0 ? (
            <View style={styles.playerListCard}>
              {team.players.map((player, index) => (
                <View
                  key={player.id}
                  style={[
                    styles.playerRow,
                    index < team.players!.length - 1 && styles.playerRowBorder,
                  ]}
                >
                  <View style={styles.playerNumberBadge}>
                    <Text style={styles.playerNumberText}>
                      {player.number != null ? player.number : '-'}
                    </Text>
                  </View>
                  <Text style={styles.playerName}>{player.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>選手が登録されていません</Text>
            </View>
          )}
        </View>

        {/* Matches Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>試合</Text>
          {matches.length > 0 ? (
            matches.map((m) => {
              const isHome = m.home_team_id === team.id;
              const isFinished = m.status === 'FINISHED' || m.status === 'FT';
              const hasSchedule = !!m.scheduled_at;

              return (
                <View key={m.id} style={styles.matchCard}>
                  {/* Date/status row */}
                  <View style={styles.matchDateRow}>
                    {isFinished ? (
                      <Text style={styles.matchStatusFT}>FT</Text>
                    ) : hasSchedule ? (
                      <Text style={styles.matchDate}>{formatTime(m.scheduled_at)}</Text>
                    ) : (
                      <Text style={styles.matchDate}>未定</Text>
                    )}
                    {m.venue && (
                      <Text style={styles.matchVenue} numberOfLines={1}>{m.venue}</Text>
                    )}
                  </View>

                  {/* Teams row */}
                  <View style={styles.matchTeamsRow}>
                    {/* Home */}
                    <View style={styles.matchTeamSide}>
                      <Text
                        style={[
                          styles.matchTeamName,
                          isHome && styles.matchTeamNameHighlight,
                        ]}
                        numberOfLines={1}
                      >
                        {m.home_team_name}
                      </Text>
                    </View>

                    {/* Score */}
                    <View style={styles.matchScoreCenter}>
                      {isFinished ? (
                        <Text style={styles.matchScoreText}>
                          {m.home_score ?? 0} - {m.away_score ?? 0}
                        </Text>
                      ) : (
                        <Text style={styles.matchScoreColon}>:</Text>
                      )}
                    </View>

                    {/* Away */}
                    <View style={[styles.matchTeamSide, { alignItems: 'flex-end' }]}>
                      <Text
                        style={[
                          styles.matchTeamName,
                          !isHome && styles.matchTeamNameHighlight,
                        ]}
                        numberOfLines={1}
                      >
                        {m.away_team_name}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>試合がありません</Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile
  profileSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  teamLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: Spacing.md,
  },
  teamLogoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  teamLogoText: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  teamName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  captainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  captainText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },

  // Sections
  sectionContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },

  // Player list
  playerListCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  playerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  playerNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumberText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  playerName: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.text,
  },

  // Match cards
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  matchDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  matchDate: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  matchStatusFT: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.matchFT,
  },
  matchVenue: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    flex: 1,
  },
  matchTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchTeamSide: {
    flex: 1,
  },
  matchTeamName: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.text,
  },
  matchTeamNameHighlight: {
    fontWeight: '700',
    color: Colors.primary,
  },
  matchScoreCenter: {
    width: 60,
    alignItems: 'center',
  },
  matchScoreText: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  matchScoreColon: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textTertiary,
  },

  // Empty
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
});
