import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme';

export interface MatchData {
  id: number;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name?: string;
  away_team_name?: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  home_score: number | null;
  away_score: number | null;
  home_pk_score?: number | null;
  away_pk_score?: number | null;
  status: string;
  scheduled_at?: string | null;
  venue?: string | null;
  home_placeholder?: string | null;
  away_placeholder?: string | null;
  winner_team_id?: number | null;
  stage_name?: string;
  group_name?: string;
  stage_id?: number | null;
  group_id?: number | null;
  tournament_id?: number | null;
  round_index?: number | null;
  label?: string | null;
}

interface Props {
  match: MatchData;
  onPress?: () => void;
}

function getStatusDisplay(status: string): { label: string; color: string } {
  switch (status) {
    case 'FT':
      return { label: 'FT', color: Colors.matchFT };
    case 'LIVE':
    case '1H':
    case '2H':
    case 'HT':
      return { label: status, color: Colors.matchLive };
    case 'PP':
    case 'POSTPONED':
      return { label: '延期', color: Colors.matchPostponed };
    default:
      return { label: 'NS', color: Colors.matchUpcoming };
  }
}

function formatTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export default function MatchCard({ match, onPress }: Props) {
  const statusInfo = getStatusDisplay(match.status);
  const homeName = match.home_team_name || match.home_placeholder || 'TBD';
  const awayName = match.away_team_name || match.away_placeholder || 'TBD';
  const isFinished = match.status === 'FT';
  const isLive = ['LIVE', '1H', '2H', 'HT'].includes(match.status);

  const scoreDisplay = isFinished || isLive
    ? `${match.home_score ?? 0} - ${match.away_score ?? 0}`
    : formatTime(match.scheduled_at) || '-- : --';

  const homeWon = match.winner_team_id === match.home_team_id;
  const awayWon = match.winner_team_id === match.away_team_id;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.statusBadge}>
        <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
        <Text style={[styles.statusText, { color: statusInfo.color }]}>
          {statusInfo.label}
        </Text>
      </View>

      <View style={styles.matchRow}>
        <View style={styles.teamSection}>
          {match.home_team_logo ? (
            <Image source={{ uri: match.home_team_logo }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamLogoPlaceholder}>
              <Text style={styles.teamLogoText}>
                {homeName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text
            style={[
              styles.teamName,
              homeWon && styles.teamNameWinner,
            ]}
            numberOfLines={1}
          >
            {homeName}
          </Text>
        </View>

        <View style={styles.scoreSection}>
          <Text
            style={[
              styles.scoreText,
              isLive && styles.scoreLive,
            ]}
          >
            {scoreDisplay}
          </Text>
          {match.home_pk_score != null && match.away_pk_score != null && (
            <Text style={styles.pkText}>
              (PK {match.home_pk_score}-{match.away_pk_score})
            </Text>
          )}
        </View>

        <View style={[styles.teamSection, styles.teamSectionRight]}>
          {match.away_team_logo ? (
            <Image source={{ uri: match.away_team_logo }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamLogoPlaceholder}>
              <Text style={styles.teamLogoText}>
                {awayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text
            style={[
              styles.teamName,
              awayWon && styles.teamNameWinner,
            ]}
            numberOfLines={1}
          >
            {awayName}
          </Text>
        </View>
      </View>

      {match.venue && (
        <Text style={styles.venueText} numberOfLines={1}>
          {match.venue}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  teamSectionRight: {
    flexDirection: 'row-reverse',
  },
  teamLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  teamLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogoText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  teamName: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.text,
    flexShrink: 1,
  },
  teamNameWinner: {
    fontWeight: '700',
  },
  scoreSection: {
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  scoreText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 1,
  },
  scoreLive: {
    color: Colors.matchLive,
  },
  pkText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  venueText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
