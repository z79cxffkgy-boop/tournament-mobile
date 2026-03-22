import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface TeamData {
  id: number;
  name: string;
  logo_url?: string | null;
  captain_display_name?: string | null;
  players?: { id: number; name: string; number?: number | null }[];
}

interface Props {
  team: TeamData;
  onPress?: () => void;
  showPlayers?: boolean;
}

export default function TeamCard({ team, onPress, showPlayers }: Props) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const playerCount = team.players?.length ?? 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress || handleToggle}
      activeOpacity={0.7}
    >
      {/* Header row */}
      <View style={styles.header}>
        {/* Team logo */}
        {team.logo_url ? (
          <Image source={{ uri: team.logo_url }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>
              {team.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Team info */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {team.name}
          </Text>
          <View style={styles.metaRow}>
            {team.captain_display_name && (
              <Text style={styles.captain} numberOfLines={1}>
                <Ionicons name="person-outline" size={11} color={Colors.textTertiary} />{' '}
                {team.captain_display_name}
              </Text>
            )}
            {playerCount > 0 && (
              <Text style={styles.playerCount}>{playerCount}名</Text>
            )}
          </View>
        </View>

        {/* Expand indicator */}
        {(showPlayers || playerCount > 0) && (
          <View style={styles.expandIcon}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={Colors.textTertiary}
            />
          </View>
        )}
      </View>

      {/* Expanded player list */}
      {expanded && team.players && team.players.length > 0 && (
        <View style={styles.playerList}>
          {team.players.map((p, index) => (
            <View
              key={p.id}
              style={[
                styles.playerRow,
                index < team.players!.length - 1 && styles.playerRowBorder,
              ]}
            >
              <View style={styles.playerNumberBadge}>
                <Text style={styles.playerNumberText}>
                  {p.number != null ? p.number : '-'}
                </Text>
              </View>
              <Text style={styles.playerName}>{p.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expanded but no players */}
      {expanded && (!team.players || team.players.length === 0) && (
        <View style={styles.noPlayers}>
          <Text style={styles.noPlayersText}>選手が登録されていません</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  captain: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  playerCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  expandIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerList: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceSecondary,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  playerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  playerNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumberText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  playerName: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.text,
  },
  noPlayers: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  noPlayersText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
});
