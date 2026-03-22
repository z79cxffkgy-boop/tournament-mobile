import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

export interface StandingRow {
  team_id: number;
  team_name: string;
  team_logo?: string | null;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  rank: number;
}

interface Props {
  rows: StandingRow[];
  groupName?: string;
  highlightTeamId?: number | null;
}

function getRankColor(rank: number): string | null {
  if (rank <= 4) return Colors.primary;
  if (rank <= 6) return Colors.warning;
  return null;
}

export default function StandingsTable({ rows, groupName, highlightTeamId }: Props) {
  return (
    <View style={styles.container}>
      {groupName && <Text style={styles.groupTitle}>{groupName}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, styles.rankCol]}>#</Text>
            <Text style={[styles.headerCell, styles.teamCol]}>チーム</Text>
            <Text style={[styles.headerCell, styles.statCol]}>終</Text>
            <Text style={[styles.headerCell, styles.statCol]}>勝</Text>
            <Text style={[styles.headerCell, styles.statCol]}>分</Text>
            <Text style={[styles.headerCell, styles.statCol]}>負</Text>
            <Text style={[styles.headerCell, styles.goalCol]}>+/-</Text>
            <Text style={[styles.headerCell, styles.statCol]}>差</Text>
            <Text style={[styles.headerCell, styles.pointsCol]}>点</Text>
          </View>

          {/* Rows */}
          {rows.map((row) => {
            const rankColor = getRankColor(row.rank);
            const isHighlighted = highlightTeamId === row.team_id;
            return (
              <View
                key={row.team_id}
                style={[
                  styles.dataRow,
                  isHighlighted && styles.highlightedRow,
                ]}
              >
                <View style={[styles.rankCol, styles.rankCell]}>
                  {rankColor && (
                    <View
                      style={[styles.rankIndicator, { backgroundColor: rankColor }]}
                    />
                  )}
                  <Text style={styles.rankText}>{row.rank}</Text>
                </View>

                <View style={[styles.teamCol, styles.teamCell]}>
                  {row.team_logo ? (
                    <Image source={{ uri: row.team_logo }} style={styles.teamLogo} />
                  ) : (
                    <View style={styles.teamLogoPlaceholder}>
                      <Text style={styles.teamLogoText}>
                        {row.team_name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.teamNameText} numberOfLines={1}>
                    {row.team_name}
                  </Text>
                </View>

                <Text style={[styles.statText, styles.statCol]}>{row.played}</Text>
                <Text style={[styles.statText, styles.statCol]}>{row.win}</Text>
                <Text style={[styles.statText, styles.statCol]}>{row.draw}</Text>
                <Text style={[styles.statText, styles.statCol]}>{row.lose}</Text>
                <Text style={[styles.statText, styles.goalCol]}>
                  {row.goals_for}-{row.goals_against}
                </Text>
                <Text
                  style={[
                    styles.statText,
                    styles.statCol,
                    { color: row.goal_diff > 0 ? Colors.success : row.goal_diff < 0 ? Colors.error : Colors.textSecondary },
                  ]}
                >
                  {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                </Text>
                <Text style={[styles.pointsText, styles.pointsCol]}>
                  {row.points}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  groupTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCell: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  highlightedRow: {
    backgroundColor: 'rgba(37,99,235,0.05)',
  },
  rankCol: {
    width: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankCell: {
    gap: 4,
  },
  rankIndicator: {
    width: 3,
    height: 20,
    borderRadius: 1.5,
  },
  rankText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  teamCol: {
    width: 130,
  },
  teamCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  teamLogo: {
    width: 22,
    height: 22,
    borderRadius: 5,
  },
  teamLogoPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogoText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  teamNameText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.text,
    flexShrink: 1,
  },
  statCol: {
    width: 30,
    textAlign: 'center',
  },
  goalCol: {
    width: 48,
    textAlign: 'center',
  },
  pointsCol: {
    width: 32,
    textAlign: 'center',
  },
  statText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  pointsText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
  },
});
