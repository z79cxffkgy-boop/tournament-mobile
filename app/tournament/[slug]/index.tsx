import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Image,
  Dimensions,
  TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, FontSize } from '../../../src/theme';
import { apiFetch } from '../../../src/api/client';
import { useAuth } from '../../../src/store/auth';
import { useSSE } from '../../../src/hooks/useSSE';
import { MatchData } from '../../../src/components/MatchCard';
import StandingsTable, { StandingRow } from '../../../src/components/StandingsTable';
import { TeamData } from '../../../src/components/TeamCard';
import MobileBracketViewer from '../../../src/components/MobileBracketViewer';
import MatchEditModal from '../../../src/components/MatchEditModal';
import LoadingScreen from '../../../src/components/LoadingScreen';
import EmptyState from '../../../src/components/EmptyState';

type Tab = 'overview' | 'matches' | 'standings' | 'teams';

interface TournamentData {
  id: number;
  name: string;
  description?: string | null;
  public_slug: string;
  date?: string | null;
  end_date?: string | null;
  venue?: string | null;
  invite_code?: string | null;
  cover_image_url?: string | null;
  is_published?: boolean;
}

interface StageData {
  id: number;
  name: string;
  type: 'LEAGUE' | 'TOURNAMENT';
  order_index: number;
  round_id?: number | null;
  settings?: any;
  groups?: GroupData[];
}

interface GroupData {
  id: number;
  name: string;
  order_index: number;
  slots?: SlotData[];
}

interface SlotData {
  id: number;
  team_id?: number | null;
  order_index: number;
  status: string;
  placeholder_label?: string | null;
  name?: string | null;
}

interface RoundData {
  id: number;
  name: string;
  order_index: number;
  status: string;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '概要' },
  { key: 'matches', label: '試合' },
  { key: 'standings', label: '順位表' },
  { key: 'teams', label: 'チーム' },
];

export default function TournamentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const pagerRef = useRef<PagerView>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [stages, setStages] = useState<StageData[]>([]);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [standings, setStandings] = useState<
    Record<number, { groups: { group_id: number; group_name: string; rows: StandingRow[] }[] }>
  >({});
  const [treeData, setTreeData] = useState<any>(null);

  // Edit modal
  const [editMatch, setEditMatch] = useState<MatchData | null>(null);
  const [editMode, setEditMode] = useState<'schedule' | 'score'>('schedule');

  // Overview editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    name: '',
    date: '',
    end_date: '',
    venue: '',
    description: '',
  });
  const [saveStatus, setSaveStatus] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const isHost = user?.role === 'host';

  const fetchAll = useCallback(async () => {
    if (!slug) return;
    try {
      let data: any;
      try {
        data = await apiFetch(`/tournaments/by-slug/${slug}/init-data`);
      } catch {
        data = await apiFetch(`/public/tournaments/${slug}/init-data`);
      }

      if (data.tournament) {
        setTournament(data.tournament);
        setEditValues({
          name: data.tournament.name || '',
          date: data.tournament.date
            ? new Date(data.tournament.date).toISOString().slice(0, 16)
            : '',
          end_date: data.tournament.end_date
            ? new Date(data.tournament.end_date).toISOString().slice(0, 16)
            : '',
          venue: data.tournament.venue || '',
          description: data.tournament.description || '',
        });
      }
      if (data.stages) setStages(data.stages);
      if (data.rounds) setRounds(data.rounds);
      if (data.teams) {
        setTeams(
          data.teams.map((t: any) => ({
            id: t.id,
            name: t.name,
            logo_url: t.logo_url,
            captain_display_name: t.captain_display_name,
            players: t.players,
          })),
        );
      }
      if (data.matches) {
        const tm = new Map<number, any>(
          (data.teams || []).map((t: any) => [t.id, t]),
        );
        setMatches(
          data.matches.map((m: any) => ({
            ...m,
            home_team_name: tm.get(m.home_team_id)?.name,
            away_team_name: tm.get(m.away_team_id)?.name,
            home_team_logo: tm.get(m.home_team_id)?.logo_url,
            away_team_logo: tm.get(m.away_team_id)?.logo_url,
          })),
        );
      }

      // Standings
      const leagueStages = (data.stages || []).filter((s: any) => s.type === 'LEAGUE');
      const standingsMap: typeof standings = {};
      for (const s of leagueStages) {
        try {
          const st = await apiFetch(`/stages/${s.id}/standings`);
          standingsMap[s.id] = st;
        } catch {}
      }
      setStandings(standingsMap);

      // Tree from stage settings
      const tournamentStages = (data.stages || []).filter((s: any) => s.type === 'TOURNAMENT');
      let foundTree = false;
      for (const ts of tournamentStages) {
        const treeSnapshot = ts.settings?.published_snapshot?.tree_snapshot;
        if (treeSnapshot) {
          const rawNodes = Array.isArray(treeSnapshot) ? treeSnapshot : (treeSnapshot?.nodes ?? []);
          if (rawNodes.length > 0) {
            setTreeData({ nodes: rawNodes });
            foundTree = true;
            break;
          }
        }
      }
      if (!foundTree && tournamentStages.length > 0) {
        try {
          const tree = await apiFetch(`/stages/${tournamentStages[0].id}/tree`);
          if (tree) setTreeData(tree);
        } catch {}
      }
    } catch (err) {
      console.error('Failed to fetch tournament data:', err);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  useSSE(tournament?.id, (signal) => {
    if (signal.type === 'match-result' || signal.type === 'schedule-updated' || signal.type === 'standings-updated') {
      fetchAll();
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const handleTabPress = (index: number) => {
    setActiveTabIndex(index);
    pagerRef.current?.setPage(index);
  };

  const handlePageSelected = (e: any) => {
    setActiveTabIndex(e.nativeEvent.position);
  };

  // Overview editing
  const handleFieldSave = async (field: string) => {
    if (!tournament?.public_slug) return;
    setSaveStatus('保存中...');
    try {
      const payload: any = {};
      if (field === 'name') payload.name = editValues.name;
      else if (field === 'date')
        payload.date = editValues.date ? new Date(editValues.date).toISOString() : null;
      else if (field === 'end_date')
        payload.end_date = editValues.end_date ? new Date(editValues.end_date).toISOString() : null;
      else if (field === 'venue') payload.venue = editValues.venue;
      else if (field === 'description') payload.description = editValues.description;

      await apiFetch(`/tournaments/${tournament.public_slug}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSaveStatus('保存しました');
      setEditingField(null);
      setTimeout(() => setSaveStatus(''), 2000);
      await fetchAll();
    } catch (e: any) {
      setSaveStatus(`エラー: ${e?.message || '保存に失敗しました'}`);
    }
  };

  const handleFieldCancel = () => {
    setEditValues({
      name: tournament?.name || '',
      date: tournament?.date ? new Date(tournament.date).toISOString().slice(0, 16) : '',
      end_date: tournament?.end_date ? new Date(tournament.end_date).toISOString().slice(0, 16) : '',
      venue: tournament?.venue || '',
      description: tournament?.description || '',
    });
    setEditingField(null);
  };

  const copyInviteCode = async () => {
    if (tournament?.invite_code) {
      await Clipboard.setStringAsync(tournament.invite_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const [uploading, setUploading] = useState(false);

  const handleCoverImageUpload = async () => {
    if (!tournament?.public_slug) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const fd = new FormData();
      fd.append('file', {
        uri: asset.uri,
        name: 'cover_image.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);
      const token = await (await import('../../../src/api/client')).getToken();
      const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const uploadRes = await fetch(`${API}/files/upload`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!uploadRes.ok) throw new Error('アップロードに失敗しました');
      const json = await uploadRes.json();
      const coverUrl = json.url || json.file_url;
      if (!coverUrl) throw new Error('URLが取得できませんでした');
      await apiFetch(`/tournaments/${tournament.public_slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ cover_image_url: coverUrl }),
      });
      await fetchAll();
    } catch (e: any) {
      Alert.alert('エラー', e.message || '画像のアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  // Helpers
  const formatDateRange = () => {
    if (!tournament?.date) return '未設定';
    const start = new Date(tournament.date);
    const startStr = `${start.getMonth() + 1}/${start.getDate()} ${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
    if (!tournament.end_date) return startStr;
    const end = new Date(tournament.end_date);
    const endStr = (start.toDateString() === end.toDateString())
      ? `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`
      : `${end.getMonth() + 1}/${end.getDate()} ${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    return `${startStr} 〜 ${endStr}`;
  };

  const formatMatchTime = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const hasTournamentStages = stages.some((s) => s.type === 'TOURNAMENT');
  const teamMap = new Map<number, TeamData>(teams.map((t) => [t.id, t]));

  // Bracket viewer data
  const tournamentStage = stages.find((s) => s.type === 'TOURNAMENT');
  const bracketSlots = tournamentStage?.groups?.flatMap((g) => g.slots || []) || [];
  const bracketMatches = matches
    .filter((m) => m.stage_id === tournamentStage?.id)
    .sort((a, b) => (a.round_index ?? 0) - (b.round_index ?? 0));


  if (loading) return <LoadingScreen message="大会データを読み込み中..." />;
  if (!tournament) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState icon="warning-outline" title="大会が見つかりません" />
      </SafeAreaView>
    );
  }

  // ====== OVERVIEW TAB ======
  const renderOverview = () => (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.tabContent}>
        {saveStatus !== '' && (
          <View style={[styles.statusBanner, { backgroundColor: saveStatus.includes('エラー') ? Colors.errorLight : Colors.successLight }]}>
            <Text style={{ color: saveStatus.includes('エラー') ? Colors.error : Colors.success, fontWeight: '600', fontSize: FontSize.sm }}>
              {saveStatus}
            </Text>
          </View>
        )}

        {/* Cover Image */}
        {tournament.cover_image_url && (
          <Image source={{ uri: tournament.cover_image_url }} style={styles.coverImage} />
        )}

        {/* Date + Venue row (2 cards side by side) */}
        <View style={styles.twoCardRow}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>日程</Text>
            {editingField === 'date' ? (
              <View style={{ gap: Spacing.sm }}>
                <TextInput
                  style={styles.infoCardInput}
                  value={editValues.date}
                  onChangeText={(v) => setEditValues((prev) => ({ ...prev, date: v }))}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor={Colors.textTertiary}
                  autoFocus
                />
                <TextInput
                  style={styles.infoCardInput}
                  value={editValues.end_date}
                  onChangeText={(v) => setEditValues((prev) => ({ ...prev, end_date: v }))}
                  placeholder="終了: YYYY-MM-DDTHH:MM"
                  placeholderTextColor={Colors.textTertiary}
                />
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={async () => { await handleFieldSave('date'); await handleFieldSave('end_date'); }}>
                    <Text style={styles.infoCardBtnText}>保存</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={handleFieldCancel}>
                    <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>取消</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity disabled={!isHost} onPress={() => isHost && setEditingField('date')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[styles.infoCardValue, isHost && { color: Colors.primary }]} numberOfLines={2}>
                    {formatDateRange()}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>会場</Text>
            {editingField === 'venue' ? (
              <View style={{ gap: Spacing.sm }}>
                <TextInput
                  style={styles.infoCardInput}
                  value={editValues.venue}
                  onChangeText={(v) => setEditValues((prev) => ({ ...prev, venue: v }))}
                  placeholder="会場名"
                  placeholderTextColor={Colors.textTertiary}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={() => handleFieldSave('venue')}>
                    <Text style={styles.infoCardBtnText}>保存</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={handleFieldCancel}>
                    <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>取消</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity disabled={!isHost} onPress={() => isHost && setEditingField('venue')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[styles.infoCardValue, isHost && { color: Colors.primary }]} numberOfLines={2}>
                    {tournament.venue || '未設定'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Invite Code with copy button */}
        {tournament.invite_code && (
          <View style={styles.inviteCodeRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.infoCardLabel}>参加コード</Text>
              <Text style={styles.inviteCodeText}>{tournament.invite_code}</Text>
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={copyInviteCode}>
              <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={18} color={codeCopied ? Colors.success : Colors.primary} />
              <Text style={[styles.copyBtnText, codeCopied && { color: Colors.success }]}>
                {codeCopied ? 'コピー済み' : 'コピー'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.infoCardLabel}>大会説明</Text>
          {editingField === 'description' ? (
            <View style={{ gap: Spacing.sm }}>
              <TextInput
                style={[styles.infoCardInput, { minHeight: 100, textAlignVertical: 'top' }]}
                value={editValues.description}
                onChangeText={(v) => setEditValues((prev) => ({ ...prev, description: v }))}
                placeholder="大会の説明を入力"
                placeholderTextColor={Colors.textTertiary}
                multiline
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={() => handleFieldSave('description')}>
                  <Text style={styles.infoCardBtnText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={handleFieldCancel}>
                  <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>キャンセル</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity disabled={!isHost} onPress={() => isHost && setEditingField('description')}>
              <Text style={styles.descriptionText}>{tournament.description || '概要を入力してください'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cover Image Upload */}
        {isHost && (
          <TouchableOpacity style={styles.uploadBtn} onPress={handleCoverImageUpload} disabled={uploading}>
            <Ionicons name="image-outline" size={20} color={Colors.primary} />
            <Text style={styles.uploadBtnText}>
              {uploading ? 'アップロード中...' : tournament.cover_image_url ? 'カバー画像を変更' : 'カバー画像をアップロード'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Stages Info — grouped by round */}
        {stages.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>ステージ構成</Text>
            {(() => {
              // Group stages by round
              const roundsWithStages = rounds
                .map((r) => ({ ...r, stages: stages.filter((s) => s.round_id === r.id) }))
                .filter((r) => r.stages.length > 0)
                .sort((a, b) => a.order_index - b.order_index);
              const unroundedStages = stages.filter((s) => !s.round_id);

              return (
                <>
                  {roundsWithStages.map((round) => (
                    <View key={round.id} style={styles.stageRoundCard}>
                      <Text style={styles.stageRoundTitle}>{round.name}</Text>
                      {round.stages.map((stage) => (
                        <View key={stage.id} style={styles.stageInfoRow}>
                          <Ionicons name={stage.type === 'LEAGUE' ? 'list-outline' : 'git-merge-outline'} size={16} color={Colors.primary} />
                          <Text style={styles.stageInfoName}>{stage.name}</Text>
                          <View style={[styles.stageTypeBadge, { backgroundColor: stage.type === 'LEAGUE' ? Colors.successLight : Colors.warningLight }]}>
                            <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: stage.type === 'LEAGUE' ? Colors.success : Colors.warning }}>
                              {stage.type === 'LEAGUE' ? 'リーグ' : 'トーナメント'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                  {unroundedStages.map((stage) => (
                    <View key={stage.id} style={styles.stageRoundCard}>
                      <View style={styles.stageInfoRow}>
                        <Ionicons name={stage.type === 'LEAGUE' ? 'list-outline' : 'git-merge-outline'} size={16} color={Colors.primary} />
                        <Text style={styles.stageInfoName}>{stage.name}</Text>
                        <View style={[styles.stageTypeBadge, { backgroundColor: stage.type === 'LEAGUE' ? Colors.successLight : Colors.warningLight }]}>
                          <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: stage.type === 'LEAGUE' ? Colors.success : Colors.warning }}>
                            {stage.type === 'LEAGUE' ? 'リーグ' : 'トーナメント'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              );
            })()}
          </View>
        )}
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );

  // ====== MATCHES TAB ======
  const liveMatches = matches.filter((m) => m.status === 'LIVE');

  const renderMatches = () => (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.tabContent}>
        {matches.length === 0 ? (
          <EmptyState icon="football-outline" title="試合がまだありません" />
        ) : (
          <>
            {/* Live matches summary at top */}
            {liveMatches.length > 0 && (
              <View style={styles.liveSummarySection}>
                <View style={styles.liveSummaryHeader}>
                  <View style={styles.liveSummaryDot} />
                  <Text style={styles.liveSummaryTitle}>LIVE</Text>
                  <Text style={styles.liveSummaryCount}>{liveMatches.length}試合</Text>
                </View>
                {liveMatches.map((m) => {
                  const hName = m.home_team_name || m.home_placeholder || 'TBD';
                  const aName = m.away_team_name || m.away_placeholder || 'TBD';
                  return (
                    <TouchableOpacity
                      key={`live-${m.id}`}
                      style={styles.liveSummaryCard}
                      activeOpacity={isHost ? 0.7 : 1}
                      onPress={() => {
                        if (isHost) {
                          setEditMatch(m);
                          setEditMode('score');
                        }
                      }}
                    >
                      <View style={styles.liveSummaryTeams}>
                        <Text style={styles.liveSummaryTeamName} numberOfLines={1}>{hName}</Text>
                        <View style={styles.liveSummaryScoreBox}>
                          <Text style={styles.liveSummaryScore}>
                            {m.home_score ?? 0} - {m.away_score ?? 0}
                          </Text>
                        </View>
                        <Text style={[styles.liveSummaryTeamName, { textAlign: 'right' }]} numberOfLines={1}>{aName}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {stages.map((stage) => {
              const stageMatches = matches.filter((m) => m.stage_id === stage.id);
              if (stageMatches.length === 0) return null;
              return (
                <View key={stage.id} style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>{stage.name}</Text>
                  {stageMatches.map((m) => renderMatchItem(m))}
                </View>
              );
            })}
            {matches.filter((m) => !stages.find((s) => s.id === m.stage_id)).length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>その他の試合</Text>
                {matches.filter((m) => !stages.find((s) => s.id === m.stage_id)).map((m) => renderMatchItem(m))}
              </View>
            )}
          </>
        )}
        {hasTournamentStages && treeData && treeData.nodes?.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>トーナメント表</Text>
            <MobileBracketViewer
              snapshot={treeData}
              matches={bracketMatches}
              mode="result"
              teams={teams}
              slots={bracketSlots}
            />
          </View>
        )}
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );

  // Match card: center shows only ":", time, score, or LIVE score. Tap to edit.
  const renderMatchItem = (m: MatchData) => {
    const matchIsFinished = m.status === 'FT';
    const matchIsLive = m.status === 'LIVE';
    const hasSchedule = !!m.scheduled_at;
    // Show placeholder label if no team name assigned
    const homeName = m.home_team_name || m.home_placeholder || '未定';
    const awayName = m.away_team_name || m.away_placeholder || '未定';
    const homeHasTeam = !!m.home_team_id;
    const awayHasTeam = !!m.away_team_id;

    const handleCardTap = () => {
      if (!isHost) return;
      if (matchIsFinished) {
        setEditMatch(m);
        setEditMode('score');
      } else if (matchIsLive) {
        setEditMatch(m);
        setEditMode('score');
      } else if (hasSchedule) {
        setEditMatch(m);
        setEditMode('score');
      } else {
        setEditMatch(m);
        setEditMode('schedule');
      }
    };

    return (
      <TouchableOpacity
        key={m.id}
        style={[styles.matchItemCard, matchIsLive && styles.matchItemCardLive]}
        activeOpacity={isHost ? 0.7 : 1}
        onPress={isHost ? handleCardTap : undefined}
      >
        {/* LIVE badge */}
        {matchIsLive && (
          <View style={styles.matchLiveRow}>
            <View style={styles.matchLiveBadge}>
              <View style={styles.matchLiveDot} />
              <Text style={styles.matchLiveBadgeText}>LIVE</Text>
            </View>
          </View>
        )}

        <View style={styles.matchTeamRow}>
          {/* Home name (right-aligned) */}
          <View style={styles.matchTeamSide}>
            <Text
              style={[
                styles.matchTeamName,
                { textAlign: 'right' },
                !homeHasTeam && styles.matchTeamPlaceholder,
                matchIsFinished && m.winner_team_id === m.home_team_id && styles.matchWinner,
              ]}
              numberOfLines={2}
            >
              {homeName}
            </Text>
          </View>

          {/* Center: Logo - Score - Logo */}
          <View style={styles.matchCenterBlock}>
            {m.home_team_logo ? (
              <Image source={{ uri: m.home_team_logo }} style={styles.matchTeamLogo} />
            ) : (
              <View style={styles.matchTeamLogoPlaceholder}>
                <Text style={styles.matchTeamLogoText}>{homeName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.matchScoreCenter}>
              {matchIsFinished ? (
                <Text style={styles.matchScoreFinished}>
                  {m.home_score ?? 0} - {m.away_score ?? 0}
                </Text>
              ) : matchIsLive ? (
                <Text style={styles.matchScoreLive}>
                  {m.home_score ?? 0} - {m.away_score ?? 0}
                </Text>
              ) : hasSchedule ? (
                <Text style={styles.matchScheduleTime}>{formatMatchTime(m.scheduled_at)}</Text>
              ) : (
                <Text style={styles.matchColon}>:</Text>
              )}
            </View>
            {m.away_team_logo ? (
              <Image source={{ uri: m.away_team_logo }} style={styles.matchTeamLogo} />
            ) : (
              <View style={styles.matchTeamLogoPlaceholder}>
                <Text style={styles.matchTeamLogoText}>{awayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Away name (left-aligned) */}
          <View style={styles.matchTeamSide}>
            <Text
              style={[
                styles.matchTeamName,
                !awayHasTeam && styles.matchTeamPlaceholder,
                matchIsFinished && m.winner_team_id === m.away_team_id && styles.matchWinner,
              ]}
              numberOfLines={2}
            >
              {awayName}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ====== STANDINGS TAB ======
  const renderStandings = () => (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.tabContent}>
        {Object.keys(standings).length > 0 ? (
          Object.entries(standings).map(([stageId, data]) => {
            const stage = stages.find((s) => s.id === Number(stageId));
            return (
              <View key={stageId}>
                {stage && <Text style={styles.stageName}>{stage.name}</Text>}
                {data.groups?.map((g) => (
                  <StandingsTable key={g.group_id} rows={g.rows} groupName={g.group_name} highlightTeamId={user?.teamId} />
                ))}
              </View>
            );
          })
        ) : !hasTournamentStages ? (
          <EmptyState icon="podium-outline" title="順位表がまだありません" message="リーグステージの順位表がここに表示されます" />
        ) : null}

        {hasTournamentStages && treeData && treeData.nodes?.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>トーナメント表</Text>
            <MobileBracketViewer
              snapshot={treeData}
              matches={bracketMatches}
              mode="result"
              teams={teams}
              slots={bracketSlots}
            />
          </View>
        )}
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );

  // ====== TEAMS TAB ======
  const renderTeams = () => {
    const roundsWithStages = rounds
      .map((r) => ({ ...r, stages: stages.filter((s) => s.round_id === r.id) }))
      .filter((r) => r.stages.length > 0)
      .sort((a, b) => a.order_index - b.order_index);

    return (
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.tabContent}>
          {/* Round Placement Cards */}
          {roundsWithStages.length > 0 &&
            roundsWithStages.map((round) => (
              <View key={round.id} style={styles.roundCard}>
                <View style={styles.roundCardHeader}>
                  <Text style={styles.roundCardTitle}>{round.name}</Text>
                  <View style={[styles.roundStatusBadge, { backgroundColor: round.status === 'FINALIZED' ? Colors.successLight : round.status === 'ACTIVE' ? Colors.warningLight : Colors.surfaceSecondary }]}>
                    <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: round.status === 'FINALIZED' ? Colors.success : round.status === 'ACTIVE' ? Colors.warning : Colors.textTertiary }}>
                      {round.status === 'FINALIZED' ? '確定済み' : round.status === 'ACTIVE' ? '進行中' : '下書き'}
                    </Text>
                  </View>
                </View>
                {round.stages.map((stage) => (
                  <View key={stage.id} style={styles.placementStage}>
                    <View style={styles.placementStageHeader}>
                      <Ionicons name={stage.type === 'LEAGUE' ? 'people-outline' : 'git-merge-outline'} size={16} color={Colors.primary} />
                      <Text style={styles.placementStageName}>{stage.name}</Text>
                    </View>
                    {stage.type === 'TOURNAMENT' && treeData && treeData.nodes?.length > 0 && (
                      <MobileBracketViewer
              snapshot={treeData}
              matches={bracketMatches}
              mode="result"
              teams={teams}
              slots={bracketSlots}
              fixedPlaceholders
            />
                    )}
                    {stage.type === 'LEAGUE' && stage.groups && stage.groups.length > 0 && (
                      <View style={styles.placementGroups}>
                        {stage.groups.map((group) => (
                          <View key={group.id} style={styles.placementGroup}>
                            <Text style={styles.placementGroupTitle}>{group.name}</Text>
                            {group.slots && group.slots.length > 0 ? (
                              group.slots.sort((a, b) => a.order_index - b.order_index).map((slot, idx) => {
                                const t = slot.team_id ? teamMap.get(slot.team_id) : null;
                                return (
                                  <View key={slot.id} style={styles.slotRow}>
                                    <View style={styles.slotIndex}><Text style={styles.slotIndexText}>{idx + 1}</Text></View>
                                    <Text style={styles.slotName} numberOfLines={1}>{t ? t.name : slot.placeholder_label || slot.name || '—'}</Text>
                                  </View>
                                );
                              })
                            ) : (
                              <Text style={styles.emptySlotText}>チーム未配置</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}

          {/* Team list — tap navigates to team detail */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>チーム一覧</Text>
            {teams.length === 0 ? (
              <EmptyState icon="people-outline" title="チームがまだありません" />
            ) : (
              teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={styles.teamListItem}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/tournament/${slug}/team/${team.id}`)}
                >
                  {team.logo_url ? (
                    <Image source={{ uri: team.logo_url }} style={styles.teamListLogo} />
                  ) : (
                    <View style={styles.teamListLogoPlaceholder}>
                      <Text style={styles.teamListLogoText}>{team.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.teamListName} numberOfLines={1}>{team.name}</Text>
                    {team.captain_display_name && (
                      <Text style={styles.teamListCaptain} numberOfLines={1}>{team.captain_display_name}</Text>
                    )}
                  </View>
                  <Text style={styles.teamListCount}>{team.players?.length ?? 0}名</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              ))
            )}
          </View>
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{tournament.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Bar — gray bg, equal spacing */}
      <View style={styles.tabBarContainer}>
        {TABS.map((tab, index) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabItem, activeTabIndex === index && styles.tabItemActive]}
            onPress={() => handleTabPress(index)}
          >
            <Text style={[styles.tabLabel, activeTabIndex === index && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pages */}
      <PagerView ref={pagerRef} style={{ flex: 1 }} initialPage={0} onPageSelected={handlePageSelected}>
        <View key="overview" style={{ flex: 1 }}>{renderOverview()}</View>
        <View key="matches" style={{ flex: 1 }}>{renderMatches()}</View>
        <View key="standings" style={{ flex: 1 }}>{renderStandings()}</View>
        <View key="teams" style={{ flex: 1 }}>{renderTeams()}</View>
      </PagerView>

      {editMatch && (
        <MatchEditModal visible={!!editMatch} onClose={() => setEditMatch(null)} match={editMatch} mode={editMode} onUpdated={fetchAll} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, textAlign: 'center' },

  // Tab bar — gray background, equal spacing
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 2.5,
    borderBottomColor: Colors.transparent,
  },
  tabItemActive: { borderBottomColor: Colors.primary },
  tabLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabLabelActive: { color: Colors.primary, fontWeight: '700' },

  tabContent: { paddingVertical: Spacing.lg, gap: Spacing.md },
  statusBanner: { marginHorizontal: Spacing.lg, padding: Spacing.md, borderRadius: BorderRadius.sm },
  coverImage: { width: SCREEN_WIDTH - Spacing.xl * 2, height: 180, borderRadius: BorderRadius.lg, marginHorizontal: Spacing.xl },

  // Upload button
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed',
  },
  uploadBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },

  // Two card row (date + venue)
  twoCardRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  infoCard: {
    flex: 1, backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, gap: Spacing.sm,
  },
  infoCardLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  infoCardValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  infoCardInput: {
    fontSize: FontSize.sm, fontWeight: '600', color: Colors.text,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, backgroundColor: Colors.surface,
  },
  infoCardBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  infoCardBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textInverse },

  // Invite code row
  inviteCodeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginHorizontal: Spacing.lg, gap: Spacing.md,
  },
  inviteCodeText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, letterSpacing: 1 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  copyBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  // Description
  descriptionCard: {
    backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginHorizontal: Spacing.lg, gap: Spacing.sm,
  },
  descriptionText: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text, lineHeight: 24 },

  // Sections
  sectionBlock: { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  stageName: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  stageRoundCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.lg, marginHorizontal: Spacing.lg, gap: Spacing.sm,
  },
  stageRoundTitle: {
    fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 2,
  },
  stageInfoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stageInfoName: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  stageTypeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },

  // Match item — clean, no action buttons
  matchItemCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.lg, marginVertical: 3,
    shadowColor: Colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  matchTeamRow: { flexDirection: 'row', alignItems: 'center' },
  matchTeamSide: { flex: 1, justifyContent: 'center', paddingHorizontal: 6 },
  matchCenterBlock: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchTeamLogo: { width: 28, height: 28, borderRadius: 6 },
  matchTeamLogoPlaceholder: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  matchTeamLogoText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  matchTeamName: { fontSize: FontSize.xs, fontWeight: '500', color: Colors.text },
  matchTeamPlaceholder: { color: Colors.textTertiary, fontStyle: 'italic' },
  matchWinner: { fontWeight: '700', color: Colors.primary },
  matchScoreCenter: { alignItems: 'center', minWidth: 40 },
  matchScoreFinished: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, letterSpacing: 1 },
  matchScheduleTime: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  matchColon: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textTertiary },

  // LIVE match card highlight
  matchItemCardLive: {
    borderWidth: 1.5,
    borderColor: Colors.error,
  },
  matchLiveRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  matchLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.error,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  matchLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textInverse,
  },
  matchLiveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textInverse,
    letterSpacing: 1,
  },
  matchScoreLive: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.error,
    letterSpacing: 1,
  },

  // Live summary section at top of matches tab
  liveSummarySection: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.error,
  },
  liveSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  liveSummaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textInverse,
  },
  liveSummaryTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textInverse,
    letterSpacing: 1,
    flex: 1,
  },
  liveSummaryCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  liveSummaryCard: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  liveSummaryTeams: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveSummaryTeamName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  liveSummaryScoreBox: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.sm,
    minWidth: 50,
    alignItems: 'center',
  },
  liveSummaryScore: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.error,
    letterSpacing: 1,
  },

  // Round placement cards
  roundCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  roundCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  roundCardTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  roundStatusBadge: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  placementStage: { padding: Spacing.lg, gap: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderLight },
  placementStageHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  placementStageName: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  placementGroups: { gap: Spacing.md },
  placementGroup: { gap: Spacing.xs },
  placementGroupTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.xs },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceSecondary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm, marginBottom: 2,
  },
  slotIndex: { width: 24, height: 24, borderRadius: 6, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  slotIndexText: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.primary },
  slotName: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  emptySlotText: { fontSize: FontSize.xs, color: Colors.textTertiary, fontStyle: 'italic' },

  // Team list items
  teamListItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginHorizontal: Spacing.lg, marginVertical: 2,
    gap: Spacing.md,
  },
  teamListLogo: { width: 40, height: 40, borderRadius: 8 },
  teamListLogoPlaceholder: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  teamListLogoText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textSecondary },
  teamListName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  teamListCaptain: { fontSize: FontSize.xs, color: Colors.textTertiary },
  teamListCount: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
});
