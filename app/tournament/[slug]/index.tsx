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
  Modal,
} from 'react-native';
import { useTranslation } from '../../../src/hooks/useTranslation';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
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
import ChatTab from '../../../src/components/ChatTab';

type Tab = 'my_matches' | 'matches' | 'standings' | 'overall' | 'teams' | 'overview' | 'mypage' | 'chat';

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
  gallery_image_1_url?: string | null;
  gallery_image_2_url?: string | null;
  is_published?: boolean;
  referee_code?: string | null;
  captain_code?: string | null;
  status?: string | null;
  host_plan_type?: string | null;
}

interface RefereeInfo {
  id: number;
  user_id: number;
  display_name: string;
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

interface StageDisplayItem {
  stage: StageData;
  isChild: boolean;
  parentStage: StageData | null;
}

interface RoundBoardEntry {
  name: string;
  logoUrl: string | null;
}

interface RoundBoardRow {
  id: string;
  stageId: number;
  label: string;
  stageName: string;
  stageType: 'LEAGUE' | 'TOURNAMENT';
  entries: RoundBoardEntry[];
  colorIndex: number;
  childStageIds?: number[];
}

// ── Tournament ranking helpers (mirrors web calcTournamentRankings) ──

interface TournamentRankEntry {
  rank: number;
  teamId: number | null;
  teamName: string;
}

function _matchWinnerMobile(m: MatchData): number | null {
  if (m.home_score == null || m.away_score == null) return null;
  if (m.home_score > m.away_score) return m.home_team_id;
  if (m.away_score > m.home_score) return m.away_team_id;
  if (m.home_pk_score != null && m.away_pk_score != null) {
    if (m.home_pk_score > m.away_pk_score) return m.home_team_id;
    if (m.away_pk_score > m.home_pk_score) return m.away_team_id;
  }
  return null;
}

function _matchLoserMobile(m: MatchData): number | null {
  const w = _matchWinnerMobile(m);
  if (w == null) return null;
  return w === m.home_team_id ? m.away_team_id : m.home_team_id;
}

function calcMobileTournamentRankings(
  stageList: StageData[],
  matchList: MatchData[],
  teamsList: { id: number; name: string }[],
  rankStageIds: Set<number>,
  treeMap: Record<number, any>,
): TournamentRankEntry[] {
  const results: TournamentRankEntry[] = [];
  const rankStagePattern = /^.+の\d+位決定戦$/;
  const isRankStage = (s: StageData) =>
    rankStageIds.has(s.id) ||
    rankStagePattern.test(s.name) ||
    (s.settings?.rank_start !== undefined && s.settings?.rank_start !== null);

  const mainStages = stageList.filter(s => s.type === 'TOURNAMENT' && !isRankStage(s));
  const getTeamName = (teamId: number | null): string =>
    teamId ? (teamsList.find(t => t.id === teamId)?.name ?? '') : '';

  for (const mainStage of mainStages) {
    const snap = treeMap[mainStage.id];
    if (!snap?.nodes?.length) continue;
    const combinedNodes = (snap.nodes as any[]).filter((n: any) => n.type === 'combined');
    if (!combinedNodes.length) continue;
    const maxX: number = Math.max(...combinedNodes.map((n: any) => n.x as number));
    const stageMatches = matchList
      .filter(m => m.stage_id === mainStage.id)
      .sort((a, b) => (a.round_index ?? 0) - (b.round_index ?? 0) || (a.id ?? 0) - (b.id ?? 0));

    const finalMatches = stageMatches.filter(m => Math.floor((m.round_index ?? 0) / 100) === maxX);
    if (!finalMatches.length) continue;
    const finalMatch = finalMatches[0];
    if (finalMatch.home_score == null || finalMatch.away_score == null) continue;

    const winner = _matchWinnerMobile(finalMatch);
    const loser = _matchLoserMobile(finalMatch);
    if (winner != null) results.push({ rank: 1, teamId: winner, teamName: getTeamName(winner) });
    if (loser != null) results.push({ rank: 2, teamId: loser, teamName: getTeamName(loser) });

    let rankStart = 3;
    for (let x = maxX - 1; x >= 1; x--) {
      const countAtX = combinedNodes.filter((n: any) => n.x === x).length;
      if (!countAtX) continue;

      const rankStage =
        stageList.find(s =>
          isRankStage(s) && (
            s.settings?.root_stage_id === mainStage.id ||
            s.settings?.parent_stage_id === mainStage.id
          ) && (s.settings?.rank_start ?? rankStart) === rankStart,
        ) ?? stageList.find(s => s.name === `${mainStage.name}の${rankStart}位決定戦`);

      if (rankStage) {
        const rankMatches = matchList
          .filter(m => m.stage_id === rankStage.id)
          .sort((a, b) => (a.round_index ?? 0) - (b.round_index ?? 0) || (a.id ?? 0) - (b.id ?? 0));
        const rankSnap = treeMap[rankStage.id];
        if (rankSnap?.nodes?.length) {
          const rankCombined = (rankSnap.nodes as any[]).filter((n: any) => n.type === 'combined');
          const rankMaxX = rankCombined.length ? Math.max(...rankCombined.map((n: any) => n.x as number)) : 0;
          const rankFinal = rankMatches.filter(m => Math.floor((m.round_index ?? 0) / 100) === rankMaxX);
          if (rankFinal.length && rankFinal[0].home_score != null && rankFinal[0].away_score != null) {
            const rw = _matchWinnerMobile(rankFinal[0]);
            const rl = _matchLoserMobile(rankFinal[0]);
            if (rw != null) results.push({ rank: rankStart, teamId: rw, teamName: getTeamName(rw) });
            if (rl != null) results.push({ rank: rankStart + 1, teamId: rl, teamName: getTeamName(rl) });
          }
        } else {
          for (const m of rankMatches) {
            if (m.home_score == null || m.away_score == null) continue;
            const rw = _matchWinnerMobile(m);
            const rl = _matchLoserMobile(m);
            if (rw != null) results.push({ rank: rankStart, teamId: rw, teamName: getTeamName(rw) });
            if (rl != null) results.push({ rank: rankStart + 1, teamId: rl, teamName: getTeamName(rl) });
          }
        }
      } else {
        const matchesAtX = stageMatches.filter(m => Math.floor((m.round_index ?? 0) / 100) === x);
        for (const m of matchesAtX) {
          const l = _matchLoserMobile(m);
          if (l != null) results.push({ rank: rankStart, teamId: l, teamName: getTeamName(l) });
        }
      }
      rankStart += countAtX;
    }
  }
  return results.sort((a, b) => a.rank - b.rank);
}

// Webの enrichPlaceholders() と同等のロジック:
// バックエンドが tree.py 経由で生成したトーナメントの match は
// home_placeholder / away_placeholder が NULL のため、
// クライアント側で tree_snapshot + slots から補完する
function enrichMatchPlaceholders(
  rawMatches: MatchData[],
  stages: StageData[],
  teamsList: { id: number; name: string; logo_url?: string | null }[],
): MatchData[] {
  const tournamentMap = new Map<
    number,
    { homeId: number | null; homeName: string | null; awayId: number | null; awayName: string | null }
  >();

  stages
    .filter((s) => s.type === 'TOURNAMENT' && s.settings?.published_snapshot?.tree_snapshot)
    .forEach((stage) => {
      const treeSnapshot = stage.settings!.published_snapshot.tree_snapshot;
      const rawNodes: any[] = Array.isArray(treeSnapshot)
        ? treeSnapshot
        : (treeSnapshot?.nodes ?? []);
      if (!rawNodes.length) return;

      const nodeById = new Map<string, any>(rawNodes.map((n: any) => [n.id, n]));
      const combinedNodes = rawNodes
        .filter((n: any) => n.type === 'combined')
        .sort((a: any, b: any) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

      const stageMatches = rawMatches
        .filter((m) => m.stage_id === stage.id)
        .sort((a, b) => ((a.round_index ?? 0) - (b.round_index ?? 0)) || ((a.id ?? 0) - (b.id ?? 0)));

      const matchByNodeId = new Map<string, MatchData>();
      combinedNodes.forEach((n: any, i: number) => {
        if (stageMatches[i]) matchByNodeId.set(n.id, stageMatches[i]);
      });

      // initial node → slot → placeholder_label / team_name
      const slotTeamByNodeId = new Map<string, { id: number | null; name: string | null }>();
      const allSlots = (stage.groups ?? []).flatMap((g) => g.slots ?? []);
      if (allSlots.length > 0) {
        const initialNodes = rawNodes
          .filter((n: any) => n.isInitial)
          .sort((a: any, b: any) => a.y - b.y);
        const sortedSlots = [...allSlots].sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
        );
        initialNodes.forEach((node: any, idx: number) => {
          const slot = sortedSlots[idx];
          if (!slot) return;
          if (slot.team_id) {
            const team = teamsList.find((t) => t.id === slot.team_id);
            slotTeamByNodeId.set(node.id, { id: slot.team_id, name: team?.name ?? null });
          } else if (slot.placeholder_label) {
            slotTeamByNodeId.set(node.id, { id: null, name: slot.placeholder_label });
          }
        });
      }

      const resolveTeam = (nodeId: string): { id: number | null; name: string | null } => {
        const node = nodeById.get(nodeId);
        if (!node) return { id: null, name: null };
        if (node.isInitial) {
          const slotResolved = slotTeamByNodeId.get(node.id);
          if (slotResolved) return slotResolved;
          const team = teamsList.find((t) => t.name === node.label);
          return { id: team?.id ?? null, name: node.label || null };
        }
        if (node.type === 'pass' && node.parentId) return resolveTeam(node.parentId);
        if (node.type === 'combined') {
          const match = matchByNodeId.get(node.id);
          if (!match) return { id: null, name: null };
          const hs = match.home_score;
          const as_ = match.away_score;
          if (hs == null || as_ == null) return { id: null, name: null };
          let winner: 'home' | 'away' | null = null;
          if (hs > as_) winner = 'home';
          else if (as_ > hs) winner = 'away';
          else if (match.home_pk_score != null && match.away_pk_score != null) {
            if (match.home_pk_score > match.away_pk_score) winner = 'home';
            else if (match.away_pk_score > match.home_pk_score) winner = 'away';
          }
          if (winner === 'home' && node.parentA) return resolveTeam(node.parentA);
          if (winner === 'away' && node.parentB) return resolveTeam(node.parentB);
        }
        return { id: null, name: null };
      };

      combinedNodes.forEach((node: any, i: number) => {
        const match = stageMatches[i];
        if (!match) return;
        const home = node.parentA ? resolveTeam(node.parentA) : { id: null, name: null };
        const away = node.parentB ? resolveTeam(node.parentB) : { id: null, name: null };
        tournamentMap.set(match.id, {
          homeId: home.id,
          homeName: home.name,
          awayId: away.id,
          awayName: away.name,
        });
      });
    });

  return rawMatches.map((m) => {
    // 既にプレースホルダーがある場合はそのまま
    if (m.home_placeholder || m.away_placeholder) return m;
    const resolved = tournamentMap.get(m.id);
    if (!resolved) return m;
    return {
      ...m,
      home_team_id: m.home_team_id ?? resolved.homeId,
      away_team_id: m.away_team_id ?? resolved.awayId,
      home_placeholder: resolved.homeName ?? m.home_placeholder,
      away_placeholder: resolved.awayName ?? m.away_placeholder,
    };
  });
}

const SCREEN_WIDTH = Dimensions.get('window').width;

// TABS_BASE は削除。コンポーネント内で t() を使って定義する

const ROUND_BOARD_PALETTE = [
  { bg: '#ffffff', border: '#dc2626', text: '#dc2626' },
  { bg: '#ffffff', border: '#ea580c', text: '#ea580c' },
  { bg: '#ffffff', border: '#eab308', text: '#a16207' },
  { bg: '#ffffff', border: '#16a34a', text: '#16a34a' },
  { bg: '#ffffff', border: '#0f766e', text: '#0f766e' },
  { bg: '#ffffff', border: '#1d4ed8', text: '#1d4ed8' },
  { bg: '#ffffff', border: '#1e3a8a', text: '#1e3a8a' },
];

export default function TournamentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // 試合タブ（index=2: teams/standings/matches...）を初期表示
  const [activeTabIndex, setActiveTabIndex] = useState(2);
  const initialSubTabSet = useRef(false);
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [displayTournament, setDisplayTournament] = useState<TournamentData | null>(null);
  const [stages, setStages] = useState<StageData[]>([]);
  const [displayStages, setDisplayStages] = useState<StageData[]>([]);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [roundNameMap, setRoundNameMap] = useState<Record<number, string>>({});
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [displayTeams, setDisplayTeams] = useState<TeamData[]>([]);
  const [contentLang, setContentLang] = useState<'ja' | 'en'>(i18n.language === 'en' ? 'en' : 'ja');
  const [translating, setTranslating] = useState(false);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [standings, setStandings] = useState<
    Record<number, { groups: { group_id: number; group_name: string; rows: StandingRow[] }[] }>
  >({});
  const [treeDataMap, setTreeDataMap] = useState<Record<number, any>>({});

  // Edit modal
  const [editMatch, setEditMatch] = useState<MatchData | null>(null);
  const [editMode, setEditMode] = useState<'schedule' | 'score'>('schedule');
  const [detailMatch, setDetailMatch] = useState<MatchData | null>(null);
  const [expandedStageMap, setExpandedStageMap] = useState<Record<number, boolean>>({});
  const [expandedBoardBrackets, setExpandedBoardBrackets] = useState<Record<number, boolean>>({});
  const [matchSubTab, setMatchSubTab] = useState(0);
  const [standingsSubTab, setStandingsSubTab] = useState(0);
  const [boardTeamPopup, setBoardTeamPopup] = useState<string | null>(null);


  // Overview modal
  const [showOverviewModal, setShowOverviewModal] = useState(false);
  // Mypage modal
  const [showMypageModal, setShowMypageModal] = useState(false);

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
  const [saveIsError, setSaveIsError] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [referees, setReferees] = useState<RefereeInfo[]>([]);
  const [editingRefereeCode, setEditingRefereeCode] = useState(false);
  const [refereeCodeInput, setRefereeCodeInput] = useState('');
  const [editingCaptainCode, setEditingCaptainCode] = useState(false);
  const [captainCodeInput, setCaptainCodeInput] = useState('');
  const [showRefereeModal, setShowRefereeModal] = useState(false);

  const isCaptainHere = user?.role === 'captain' && user?.tournamentSlug === slug;
  const isGuestHere = user?.role === 'guest' && user?.tournamentSlug === slug;
  const isUserAccount = user?.role === 'user';
  // TABS is defined after myTournamentData

  // 審判の担当試合（role='user'の場合にフェッチ）
  const [myTournamentData, setMyTournamentData] = useState<{
    role?: string;
    team_id?: number | null;
    next_match?: {
      id: number;
      home_team_id: number | null;
      away_team_id: number | null;
      home_score: number | null;
      away_score: number | null;
      scheduled_at: string | null;
      venue: string | null;
      status: string;
      home_placeholder: string | null;
      away_placeholder: string | null;
    } | null;
    assigned_matches?: Array<{
      id: number;
      home_team_id: number | null;
      away_team_id: number | null;
      home_score: number | null;
      away_score: number | null;
      scheduled_at: string | null;
      venue: string | null;
      status: string;
      home_placeholder: string | null;
      away_placeholder: string | null;
    }>;
  } | null>(null);

  // per-tournament 判定: TournamentParticipant(role='host') ベース（myTournamentData 後に配置）
  const isHost = user?.role === 'host' || (user?.role === 'user' && myTournamentData?.role === 'host');
  const isRefereeUser = isUserAccount && myTournamentData?.role === 'referee';

  // Free plan feature gating
  // 1day: サブスクプラン基準。複数日程: 単発プラン基準（サブスクと無関係、常にチャット有効）
  const hostPlanType: string = tournament?.host_plan_type ?? 'free';
  const isMultiDay = !!(
    tournament?.end_date && tournament?.date &&
    new Date(tournament.end_date).toDateString() !== new Date(tournament.date).toDateString()
  );
  const chatEnabled = hostPlanType !== 'free' || isMultiDay;
  const isFree = hostPlanType === 'free' && !isMultiDay;

  const ALL_TABS: { key: Tab; label: string }[] = [
    { key: 'teams', label: t('tournament.tabs.teams') },
    { key: 'standings', label: t('tournament.tabs.standings') },
    { key: 'matches', label: t('tournament.tabs.matches') },
    { key: 'chat', label: t('tournament.tabs.announcements') },
    { key: 'overview', label: t('tournament.tabs.overview') },
  ];
  const TABS = ALL_TABS.filter(tab => tab.key !== 'chat' || chatEnabled);

  // Chat: determine participant role for ChatTab (must be after myTournamentData declaration)
  const chatParticipantRole: string | null = isHost
    ? 'host'
    : isUserAccount
      ? (myTournamentData?.role ?? null)
      : isCaptainHere
        ? 'captain'
        : isGuestHere
          ? 'guest'
          : null;
  const chatTeamId: number | null = isUserAccount
    ? (myTournamentData?.team_id ?? null)
    : isCaptainHere
      ? (user?.teamId ?? null)
      : null;

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
        const mappedMatches: MatchData[] = data.matches.map((m: any) => ({
          ...m,
          home_team_name: tm.get(m.home_team_id)?.name,
          away_team_name: tm.get(m.away_team_id)?.name,
          home_team_logo: tm.get(m.home_team_id)?.logo_url,
          away_team_logo: tm.get(m.away_team_id)?.logo_url,
        }));
        // Webの enrichPlaceholders() 相当: tree_snapshot + slots から
        // トーナメントの match の placeholder を補完する
        const enrichedMatches = enrichMatchPlaceholders(
          mappedMatches,
          data.stages || [],
          data.teams || [],
        );
        setMatches(enrichedMatches);
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

      // Tree from stage settings — collect for ALL tournament stages (including rank stages)
      const tournamentStages = (data.stages || []).filter((s: any) => s.type === 'TOURNAMENT');
      const newTreeDataMap: Record<number, any> = {};
      for (const ts of tournamentStages) {
        const ps = ts.settings?.published_snapshot;
        const treeSnapshot = ps?.tree_snapshot;
        if (treeSnapshot) {
          const rawNodes = Array.isArray(treeSnapshot) ? treeSnapshot : (treeSnapshot?.nodes ?? []);
          if (rawNodes.length > 0) {
            // Preserve active_ids and node_count for correct MobileBracketViewer sizing
            newTreeDataMap[ts.id] = {
              nodes: rawNodes,
              active_ids: ps?.active_ids ?? rawNodes.map((n: any) => n.id),
              node_count: ps?.node_count ?? rawNodes.filter((n: any) => n.isInitial).length,
            };
            continue;
          }
        }
        // Fallback: fetch from API if no snapshot in settings (host only)
        try {
          const tree = await apiFetch(`/stages/${ts.id}/tree`);
          if (tree && tree.nodes?.length > 0) newTreeDataMap[ts.id] = tree;
        } catch {}
      }
      setTreeDataMap(newTreeDataMap);

      // per-tournament ロールを fetchAll 内で同時取得 → isHost が初回レンダーから正しく決まる
      if (data.tournament?.id) {
        try {
          const myData = await apiFetch(`/participants/users/me/tournaments/${data.tournament.id}`);
          setMyTournamentData(myData);
        } catch {
          // 未参加（ゲスト）の場合は null のまま
        }
      }
    } catch (err) {
      console.error('Failed to fetch tournament data:', err);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  // 初回のみ: referee判定後にboard subtab(全体像)を確実にセット
  useEffect(() => {
    if (initialSubTabSet.current) return;
    if (myTournamentData === undefined) return; // まだ未取得
    const boardIdx = isRefereeUser ? 1 : 0;
    setMatchSubTab(boardIdx);
    initialSubTabSet.current = true;
  }, [myTournamentData, isRefereeUser]);

  // ホストの場合、審判一覧を取得
  useEffect(() => {
    if (!isHost || !tournament?.id) return;
    apiFetch(`/participants/tournaments/${tournament.id}/referees`)
      .then((data) => setReferees(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [isHost, tournament?.id]);

  // myTournamentData は fetchAll 内で取得済みのため、ここでは個別 effect 不要

  useSSE(tournament?.id, (signal) => {
    if (signal.type === 'match-result' || signal.type === 'schedule-updated' || signal.type === 'standings-updated') {
      fetchAll();
    }
  });

  // UIの言語切り替えに合わせてcontentLangも自動同期（ウェブ版と同じ動作）
  useEffect(() => {
    const newLang = i18n.language === 'en' ? 'en' : 'ja';
    setContentLang(newLang);
  }, [i18n.language]);

  // 言語 or データ変更時にコンテンツを翻訳
  // i18n.language を優先: ホスト以外(審判・代表者・ゲスト)でも contentLang が
  // 'ja' のまま残ることがあるため、i18n.language === 'en' なら必ず翻訳を実行する
  const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  useEffect(() => {
    const effectiveLang = i18n.language === 'en' ? 'en' : contentLang;
    if (effectiveLang === 'ja' || !tournament) {
      setDisplayTournament(tournament);
      setDisplayTeams(teams);
      setDisplayStages(stages);
      setRoundNameMap({});
      return;
    }
    setTranslating(true);
    const allTexts = [
      tournament.name, tournament.venue, tournament.description,
      ...rounds.map(r => r.name),
      ...teams.map(t => t.name),
      ...stages.map(s => s.name),
    ].filter(Boolean) as string[];
    fetch(`${API}/translate/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: allTexts, target_lang: effectiveLang, source_lang: 'auto' }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const map: Record<string, string> = {};
        allTexts.forEach((t, i) => { map[t] = data.translations[i] ?? t; });
        const tr = (v: string | null | undefined) => v ? (map[v] ?? v) : v;
        setDisplayTournament({ ...tournament, name: tr(tournament.name) ?? tournament.name, venue: tr(tournament.venue), description: tr(tournament.description) });
        setDisplayTeams(teams.map(t => ({ ...t, name: tr(t.name) ?? t.name })));
        setDisplayStages(stages.map(s => ({ ...s, name: tr(s.name) ?? s.name })));
        const newRoundMap: Record<number, string> = {};
        rounds.forEach(r => { if (tr(r.name)) newRoundMap[r.id] = tr(r.name)!; });
        setRoundNameMap(newRoundMap);
      })
      .catch(() => {
        setDisplayTournament(tournament);
        setDisplayTeams(teams);
        setDisplayStages(stages);
        setRoundNameMap({});
      })
      .finally(() => setTranslating(false));
  }, [i18n.language, contentLang, tournament, teams, stages, rounds]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const handleLeave = useCallback(() => {
    if (!tournament?.id) return;
    Alert.alert(
      t('tournament.alerts.leave_title'),
      t('tournament.alerts.leave_body'),
      [
        { text: t('tournament.actions.cancel_long'), style: 'cancel' },
        {
          text: t('tournament.alerts.leave_btn'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/participants/tournaments/${tournament.id}/leave`, { method: 'DELETE' });
              setMyTournamentData(null);
              router.back();
            } catch (err: any) {
              Alert.alert(t('tournament.alerts.error'), err.message || t('tournament.errors.leave_failed'));
            }
          },
        },
      ],
    );
  }, [tournament?.id, router]);

  const handleTabPress = (index: number) => {
    setActiveTabIndex(index);
  };

  // Reusable scrollable sub-tab bar
  const renderSubTabs = (
    tabs: { key: string; label: string }[],
    activeIndex: number,
    onPress: (index: number) => void,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.subTabBar}
      contentContainerStyle={styles.subTabBarContent}
    >
      {tabs.map((tab, index) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.subTabItem, activeIndex === index && styles.subTabItemActive]}
          onPress={() => onPress(index)}
        >
          <Text style={[styles.subTabLabel, activeIndex === index && styles.subTabLabelActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // Overview editing
  const handleFieldSave = async (field: string) => {
    if (!tournament?.public_slug) return;
    setSaveStatus(t('tournament.saving'));
    setSaveIsError(false);
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
      setSaveStatus(t('tournament.saved'));
      setEditingField(null);
      setTimeout(() => setSaveStatus(''), 2000);
      await fetchAll();
    } catch (e: any) {
      setSaveIsError(true);
      setSaveStatus(`${t('tournament.alerts.error')}: ${e?.message || t('tournament.errors.save_failed')}`);
    }
  };

  const handleSaveRefereeCode = async () => {
    if (!tournament?.id) return;
    const code = refereeCodeInput.trim();
    if (!code) {
      Alert.alert(t('tournament.alerts.input_error'), t('tournament.alerts.enter_referee_code'));
      return;
    }
    try {
      await apiFetch(`/participants/tournaments/${tournament.id}/referee-code`, {
        method: 'PATCH',
        body: JSON.stringify({ referee_code: code }),
      });
      setEditingRefereeCode(false);
      await fetchAll();
    } catch (e: any) {
      Alert.alert(t('tournament.alerts.error'), e?.message || t('tournament.errors.save_failed'));
    }
  };

  const handleSaveCaptainCode = async () => {
    if (!tournament?.id) return;
    const code = captainCodeInput.trim();
    if (!code) {
      Alert.alert(t('tournament.alerts.input_error'), t('tournament.alerts.enter_captain_code'));
      return;
    }
    try {
      await apiFetch(`/participants/tournaments/${tournament.id}/captain-code`, {
        method: 'PATCH',
        body: JSON.stringify({ captain_code: code }),
      });
      setEditingCaptainCode(false);
      await fetchAll();
    } catch (e: any) {
      Alert.alert(t('tournament.alerts.error'), e?.message || t('tournament.errors.save_failed'));
    }
  };

  const handleFinishTournament = async () => {
    if (!tournament?.id) return;
    Alert.alert(
      t('tournament.alerts.finish_title'),
      t('tournament.alerts.finish_body'),
      [
        { text: t('tournament.actions.cancel_long'), style: 'cancel' },
        {
          text: t('tournament.alerts.finish_btn'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/participants/tournaments/${tournament.id}/finish`, { method: 'PATCH' });
              await fetchAll();
            } catch (e: any) {
              Alert.alert(t('tournament.alerts.error'), e?.message || t('tournament.errors.finish_failed'));
            }
          },
        },
      ]
    );
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
      const uploadRes = await fetch(`${API}/upload`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!uploadRes.ok) throw new Error(t('tournament.errors.upload_failed'));
      const json = await uploadRes.json();
      const coverUrl = json.url || json.file_url;
      if (!coverUrl) throw new Error(t('tournament.errors.url_failed'));
      await apiFetch(`/tournaments/${tournament.public_slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ cover_image_url: coverUrl }),
      });
      await fetchAll();
    } catch (e: any) {
      Alert.alert(t('tournament.alerts.error'), e.message || t('tournament.errors.image_upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  const handleGalleryImageUpload = async (slot: 1 | 2) => {
    if (!tournament?.public_slug) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const fd = new FormData();
      fd.append('file', {
        uri: asset.uri,
        name: `gallery_${slot}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      } as any);
      const token = await (await import('../../../src/api/client')).getToken();
      const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const uploadRes = await fetch(`${API}/upload`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!uploadRes.ok) throw new Error(t('tournament.errors.upload_failed'));
      const json = await uploadRes.json();
      const imgUrl = json.url || json.file_url;
      if (!imgUrl) throw new Error(t('tournament.errors.url_failed'));
      const field = slot === 1 ? 'gallery_image_1_url' : 'gallery_image_2_url';
      await apiFetch(`/tournaments/${tournament.public_slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: imgUrl }),
      });
      await fetchAll();
    } catch (e: any) {
      Alert.alert(t('tournament.alerts.error'), e.message || t('tournament.errors.image_upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  const handleGalleryImageRemove = async (slot: 1 | 2) => {
    if (!tournament?.public_slug) return;
    Alert.alert(t('tournament.alerts.delete_photo_title'), t('tournament.alerts.delete_photo_body'), [
      { text: t('tournament.actions.cancel_long'), style: 'cancel' },
      {
        text: t('tournament.actions.delete'), style: 'destructive', onPress: async () => {
          try {
            const field = slot === 1 ? 'gallery_image_1_url' : 'gallery_image_2_url';
            await apiFetch(`/tournaments/${tournament.public_slug}`, {
              method: 'PATCH',
              body: JSON.stringify({ [field]: '' }),
            });
            await fetchAll();
          } catch (e: any) {
            Alert.alert(t('tournament.alerts.error'), e.message || t('tournament.errors.delete_failed'));
          }
        }
      },
    ]);
  };

  // Helpers
  const formatDateRange = () => {
    if (!tournament?.date) return t('tournament.overview.not_set');
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

  const formatMatchDateTime = (dateStr?: string | null): string => {
    if (!dateStr) return t('tournament.overview.not_set');
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return t('tournament.overview.not_set');
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const sortMatchesChronologically = (list: MatchData[]): MatchData[] => {
    const parseTs = (v?: string | null): number | null => {
      if (!v) return null;
      const ts = Date.parse(v);
      return Number.isNaN(ts) ? null : ts;
    };
    return [...list].sort((a, b) => {
      const aTs = parseTs(a.scheduled_at);
      const bTs = parseTs(b.scheduled_at);
      if (aTs != null && bTs != null && aTs !== bTs) return aTs - bTs;
      if (aTs != null && bTs == null) return -1;
      if (aTs == null && bTs != null) return 1;
      const aRound = a.round_index ?? Number.MAX_SAFE_INTEGER;
      const bRound = b.round_index ?? Number.MAX_SAFE_INTEGER;
      if (aRound !== bRound) return aRound - bRound;
      return (a.id ?? 0) - (b.id ?? 0);
    });
  };

  const getStageMatchGroups = (stage: StageData, stageMatches: MatchData[]) => {
    const stageGroupOrder = new Map<number, number>(
      (stage.groups ?? []).map((g) => [g.id, g.order_index ?? Number.MAX_SAFE_INTEGER]),
    );
    const grouped = new Map<string, { key: string; name: string | null; order: number; matches: MatchData[] }>();

    stageMatches.forEach((m) => {
      const hasGroup = m.group_id != null;
      const key = hasGroup ? `group-${m.group_id}` : 'ungrouped';
      const nameFromStage = (stage.groups ?? []).find((g) => g.id === m.group_id)?.name ?? null;
      const groupName = hasGroup ? (m.group_name ?? nameFromStage) : null;
      const groupOrder = hasGroup
        ? stageGroupOrder.get(m.group_id as number) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;

      const current = grouped.get(key);
      if (current) {
        current.matches.push(m);
        if (!current.name && groupName) current.name = groupName;
        return;
      }
      grouped.set(key, { key, name: groupName, order: groupOrder, matches: [m] });
    });

    return [...grouped.values()]
      .map((group) => ({ ...group, matches: sortMatchesChronologically(group.matches) }))
      .sort((a, b) => (a.order - b.order) || (a.name ?? '').localeCompare(b.name ?? ''));
  };

  const getMatchStatusLabel = (status: string): string => {
    if (status === 'FT') return t('tournament.status.finished');
    if (status === 'LIVE' || status === '1H' || status === '2H' || status === 'HT') return `${t('tournament.status.live')} (${status})`;
    if (status === 'PP' || status === 'POSTPONED') return t('tournament.status.postponed');
    return t('tournament.status.not_started');
  };

  const toggleStageAccordion = (stageId: number) => {
    setExpandedStageMap((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const formatMonthDayTime = (d: Date): string =>
    `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

  const getRoundDateRange = (stageList: StageData[]): string => {
    const stageIds = new Set(stageList.map((s) => s.id));
    const times = matches
      .filter((m) => m.stage_id != null && stageIds.has(m.stage_id))
      .map((m) => (m.scheduled_at ? Date.parse(m.scheduled_at) : NaN))
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);

    if (times.length === 0) return t('tournament.overview.not_set');
    const start = new Date(times[0]);
    const end = new Date(times[times.length - 1]);
    return `${formatMonthDayTime(start)} - ${formatMonthDayTime(end)}`;
  };

  const hasTournamentStages = stages.some((s) => s.type === 'TOURNAMENT');
  const teamMap = new Map<number, TeamData>(teams.map((t) => [t.id, t]));

  // Helper: per-stage bracket data
  const getBracketSlots = (stage: StageData) =>
    stage.groups?.flatMap((g) => g.slots || []) || [];
  const getBracketMatches = (stageId: number) =>
    matches
      .filter((m) => m.stage_id === stageId)
      .sort((a, b) => (a.round_index ?? 0) - (b.round_index ?? 0));

  const sortStagesByOrder = (stageList: StageData[]): StageData[] =>
    [...stageList].sort((a, b) => {
      const aOrder = a.order_index ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.order_index ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.id - b.id;
    });

  // ステージ名の構造的な部分を翻訳（システム生成パターンのみ）
  // AI翻訳済みステージ名 + パターン変換を組み合わせる
  const translateStageName = (name: string): string => {
    if (i18n.language === 'ja') return name;
    // まずstageNameMapでAI翻訳済みの名前に置き換える
    let result = stageNameMap[name] ?? name;
    // 構造的パターン変換
    result = result.replace(/^(.+?)の(\d+)位決定戦$/, (_, prefix, n) => {
      const num = parseInt(n, 10);
      const suffix = num === 3 ? '3rd' : num === 1 ? '1st' : num === 2 ? '2nd' : `${num}th`;
      return `${stageNameMap[prefix] ?? prefix} ${suffix} Place Match`;
    });
    result = result.replace(/(\d+)位決定戦/g, (_, n) => {
      const num = parseInt(n, 10);
      const suffix = num === 3 ? '3rd' : num === 1 ? '1st' : num === 2 ? '2nd' : `${num}th`;
      return `${suffix} Place Match`;
    });
    result = result.replace(/暫定/g, 'Provisional');
    result = result.replace(/各(\d+)位/g, '#$1 Each');
    result = result.replace(/(\d+)位/g, '#$1');
    result = result.replace(/全体/g, 'Overall');
    result = result.replace(/リーグ/g, 'League');
    result = result.replace(/トーナメント/g, 'Tournament');
    result = result.replace(/準決勝/g, 'Semifinal');
    result = result.replace(/決勝/g, 'Final');
    result = result.replace(/敗者/g, 'Loser');
    result = result.replace(/勝者/g, 'Winner');
    result = result.replace(/[①]/g, '1');
    result = result.replace(/[②]/g, '2');
    result = result.replace(/[③]/g, '3');
    result = result.replace(/[④]/g, '4');
    result = result.replace(/の/g, ' ');
    result = result.replace(/未定/g, 'TBD');
    return result;
  };

  const normalizeStageName = (name: string): string =>
    name.trim().replace(/\s+/g, '').toLowerCase();

  const getThirdPlaceParentBaseName = (stageName: string): string | null => {
    const matched = stageName.trim().match(/^(.+?)\s*の3位決定戦$/);
    return matched?.[1]?.trim() || null;
  };

  const resolveThirdPlaceParentStage = (stage: StageData, tournamentStages: StageData[]): StageData | null => {
    const baseName = getThirdPlaceParentBaseName(stage.name);
    if (!baseName) return null;
    const normalizedBaseName = normalizeStageName(baseName);

    const sameRoundCandidates = sortStagesByOrder(
      tournamentStages.filter((candidate) =>
        candidate.id !== stage.id
        && candidate.round_id != null
        && candidate.round_id === stage.round_id
        && normalizeStageName(candidate.name) === normalizedBaseName),
    );
    if (sameRoundCandidates.length > 0) return sameRoundCandidates[0];

    const fallbackCandidates = sortStagesByOrder(
      tournamentStages.filter((candidate) =>
        candidate.id !== stage.id
        && normalizeStageName(candidate.name) === normalizedBaseName),
    );
    return fallbackCandidates[0] ?? null;
  };

  const allTournamentStages = sortStagesByOrder(stages.filter((s) => s.type === 'TOURNAMENT'));
  const thirdPlaceParentStageIdMap = new Map<number, number>();
  allTournamentStages.forEach((stage) => {
    const parent = resolveThirdPlaceParentStage(stage, allTournamentStages);
    if (parent) thirdPlaceParentStageIdMap.set(stage.id, parent.id);
  });

  const getChildTournamentStages = (parentStageId: number, scopedStageIds?: Set<number>): StageData[] =>
    allTournamentStages.filter((stage) => {
      if (thirdPlaceParentStageIdMap.get(stage.id) !== parentStageId) return false;
      if (scopedStageIds && !scopedStageIds.has(stage.id)) return false;
      return true;
    });

  const buildTournamentBracketGroups = (stageList: StageData[]) => {
    const sortedStages = sortStagesByOrder(stageList);
    const stageIdSet = new Set(sortedStages.map((stage) => stage.id));
    const childIds = new Set<number>();
    const childrenByParentId = new Map<number, StageData[]>();

    sortedStages.forEach((stage) => {
      const parentId = thirdPlaceParentStageIdMap.get(stage.id);
      if (!parentId || !stageIdSet.has(parentId)) return;
      childIds.add(stage.id);
      const current = childrenByParentId.get(parentId) ?? [];
      current.push(stage);
      childrenByParentId.set(parentId, current);
    });

    return sortedStages
      .filter((stage) => !childIds.has(stage.id))
      .map((parent) => ({
        parent,
        children: sortStagesByOrder(childrenByParentId.get(parent.id) ?? []),
      }));
  };

  const buildStageDisplayItems = (stageList: StageData[]): StageDisplayItem[] => {
    const sortedStages = sortStagesByOrder(stageList);
    const stageIdSet = new Set(sortedStages.map((stage) => stage.id));
    const childIds = new Set<number>();
    const childrenByParentId = new Map<number, StageData[]>();
    const stageById = new Map<number, StageData>(sortedStages.map((stage) => [stage.id, stage]));

    sortedStages.forEach((stage) => {
      const parentId = thirdPlaceParentStageIdMap.get(stage.id);
      if (!parentId || !stageIdSet.has(parentId)) return;
      childIds.add(stage.id);
      const current = childrenByParentId.get(parentId) ?? [];
      current.push(stage);
      childrenByParentId.set(parentId, current);
    });

    const displayItems: StageDisplayItem[] = [];
    sortedStages.forEach((stage) => {
      if (childIds.has(stage.id)) return;
      displayItems.push({ stage, isChild: false, parentStage: null });

      sortStagesByOrder(childrenByParentId.get(stage.id) ?? []).forEach((childStage) => {
        displayItems.push({
          stage: childStage,
          isChild: true,
          parentStage: stageById.get(stage.id) ?? null,
        });
      });
    });
    return displayItems;
  };

  const tournamentStagesWithTree = stages.filter(
    (stage) => stage.type === 'TOURNAMENT' && treeDataMap[stage.id]?.nodes?.length > 0,
  );
  const tournamentBracketGroups = buildTournamentBracketGroups(tournamentStagesWithTree);


  if (loading) return <LoadingScreen message={t('tournament.loading')} onBack={() => router.back()} />;
  if (!tournament) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState icon="warning-outline" title={t('tournament.not_found')} />
      </SafeAreaView>
    );
  }

  // ====== OVERVIEW TAB ======
  const renderOverview = () => {
    const encodedName = encodeURIComponent(tournament.name || '');
    const encodedCode = encodeURIComponent(tournament.invite_code || '');
    const webBase = (process.env.EXPO_PUBLIC_WEB_URL || 'https://tournament-frontend-lemon.vercel.app').replace(/\/+$/, '');
    const guestJoinQrValue = `${webBase}/join?name=${encodedName}&code=${encodedCode}`;

    const disp = displayTournament ?? tournament;

    return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.tabContent}>
        {saveStatus !== '' && (
          <View style={[styles.statusBanner, { backgroundColor: saveIsError ? Colors.errorLight : Colors.successLight }]}>
            <Text style={{ color: saveIsError ? Colors.error : Colors.success, fontWeight: '600', fontSize: FontSize.sm }}>
              {saveStatus}
            </Text>
          </View>
        )}

        {/* Cover Image + Upload */}
        {tournament.cover_image_url ? (
          <TouchableOpacity activeOpacity={0.8} onPress={isHost ? handleCoverImageUpload : undefined} disabled={!isHost || uploading}>
            <Image source={{ uri: tournament.cover_image_url }} style={styles.coverImage} />
            {isHost && (
              <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="camera-outline" size={14} color="#fff" />
                <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>{t('tournament.actions.change')}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : isHost ? (
          <TouchableOpacity
            style={{ height: 160, borderRadius: BorderRadius.md, backgroundColor: '#f1f5f9', borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}
            onPress={handleCoverImageUpload}
            disabled={uploading}
            activeOpacity={0.7}
          >
            <Ionicons name="image-outline" size={32} color={Colors.textTertiary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textSecondary }}>
              {uploading ? t('tournament.actions.uploading') : t('tournament.overview.cover_photo_btn')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Date + Venue row (2 cards side by side) */}
        <View style={styles.twoCardRow}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>{t('tournament.overview.date')}</Text>
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
                  placeholder={t('tournament.placeholders.date_end')}
                  placeholderTextColor={Colors.textTertiary}
                />
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={async () => { await handleFieldSave('date'); await handleFieldSave('end_date'); }}>
                    <Text style={styles.infoCardBtnText}>{t('tournament.actions.save')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={handleFieldCancel}>
                    <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>{t('tournament.actions.cancel')}</Text>
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
            <Text style={styles.infoCardLabel}>{t('tournament.overview.venue')}</Text>
            {editingField === 'venue' ? (
              <View style={{ gap: Spacing.sm }}>
                <TextInput
                  style={styles.infoCardInput}
                  value={editValues.venue}
                  onChangeText={(v) => setEditValues((prev) => ({ ...prev, venue: v }))}
                  placeholder={t('tournament.placeholders.venue')}
                  placeholderTextColor={Colors.textTertiary}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={() => handleFieldSave('venue')}>
                    <Text style={styles.infoCardBtnText}>{t('tournament.actions.save')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={handleFieldCancel}>
                    <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>{t('tournament.actions.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity disabled={!isHost} onPress={() => isHost && setEditingField('venue')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[styles.infoCardValue, isHost && { color: Colors.primary }]} numberOfLines={2}>
                    {disp.venue || t('tournament.overview.not_set')}
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
              <Text style={styles.infoCardLabel}>{t('tournament.overview.invite_code')}</Text>
              <Text style={styles.inviteCodeText}>{tournament.invite_code}</Text>
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={copyInviteCode}>
              <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={18} color={codeCopied ? Colors.success : Colors.primary} />
              <Text style={[styles.copyBtnText, codeCopied && { color: Colors.success }]}>
                {codeCopied ? t('tournament.actions.copied') : t('tournament.actions.copy')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Referee Code (host only, Light/Pro plan) */}
        {isHost && !isFree && (
          <View style={styles.inviteCodeRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.infoCardLabel}>{t('tournament.overview.referee_code')}</Text>
              {editingRefereeCode ? (
                <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.infoCardInput, { flex: 1 }]}
                    value={refereeCodeInput}
                    onChangeText={setRefereeCodeInput}
                    placeholder={t('tournament.placeholders.referee_code')}
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="number-pad"
                    maxLength={10}
                    autoFocus
                  />
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={handleSaveRefereeCode}>
                    <Text style={styles.infoCardBtnText}>{t('tournament.actions.save')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={() => setEditingRefereeCode(false)}>
                    <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>{t('tournament.actions.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setRefereeCodeInput(tournament.referee_code || ''); setEditingRefereeCode(true); }}>
                  <Text style={[styles.inviteCodeText, { color: tournament.referee_code ? Colors.text : Colors.textTertiary }]}>
                    {tournament.referee_code || t('tournament.overview.not_set_tap')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Captain Code (host only, Light/Pro plan) */}
        {isHost && !isFree && (
          <View style={styles.inviteCodeRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.infoCardLabel}>{t('tournament.overview.captain_code')}</Text>
              {editingCaptainCode ? (
                <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.infoCardInput, { flex: 1 }]}
                    value={captainCodeInput}
                    onChangeText={setCaptainCodeInput}
                    placeholder={t('tournament.placeholders.captain_code')}
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="number-pad"
                    maxLength={10}
                    autoFocus
                  />
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={handleSaveCaptainCode}>
                    <Text style={styles.infoCardBtnText}>{t('tournament.actions.save')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={() => setEditingCaptainCode(false)}>
                    <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>{t('tournament.actions.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setCaptainCodeInput(tournament.captain_code || ''); setEditingCaptainCode(true); }}>
                  <Text style={[styles.inviteCodeText, { color: tournament.captain_code ? Colors.text : Colors.textTertiary }]}>
                    {tournament.captain_code || t('tournament.overview.not_set_tap')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Referees list (host only) */}
        {isHost && referees.length > 0 && (
          <View style={styles.inviteCodeRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.infoCardLabel}>{t('tournament.overview.referee_list')}</Text>
              {referees.map((ref) => (
                <Text key={ref.id} style={styles.infoCardValue}>{ref.display_name}</Text>
              ))}
            </View>
          </View>
        )}

        {/* Guest Join QR Code */}
        {tournament.invite_code && (
          <View style={styles.guestQrCard}>
            <Text style={styles.infoCardLabel}>{t('tournament.overview.guest_qr')}</Text>
            <View style={styles.guestQrInner}>
              <QRCode value={guestJoinQrValue} size={168} />
            </View>
            <Text style={styles.guestQrHint}>{t('tournament.overview.guest_qr_hint')}</Text>
            <Text style={styles.guestQrUrl} selectable>{guestJoinQrValue}</Text>
            <TouchableOpacity
              style={styles.guestQrCopyBtn}
              activeOpacity={0.6}
              onPress={async () => {
                await Clipboard.setStringAsync(guestJoinQrValue);
                Alert.alert(t('tournament.actions.copied'), t('tournament.overview.guest_qr_hint'));
              }}
            >
              <Text style={styles.guestQrCopyBtnText}>{t('tournament.actions.copy')} URL</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.infoCardLabel}>{t('tournament.overview.description')}</Text>
          {editingField === 'description' ? (
            <View style={{ gap: Spacing.sm }}>
              <TextInput
                style={[styles.infoCardInput, { minHeight: 100, textAlignVertical: 'top' }]}
                value={editValues.description}
                onChangeText={(v) => setEditValues((prev) => ({ ...prev, description: v }))}
                placeholder={t('tournament.placeholders.description')}
                placeholderTextColor={Colors.textTertiary}
                multiline
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.primary }]} onPress={() => handleFieldSave('description')}>
                  <Text style={styles.infoCardBtnText}>{t('tournament.actions.save')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.infoCardBtn, { backgroundColor: Colors.surfaceSecondary }]} onPress={handleFieldCancel}>
                  <Text style={[styles.infoCardBtnText, { color: Colors.text }]}>{t('tournament.actions.cancel_long')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity disabled={!isHost} onPress={() => isHost && setEditingField('description')}>
              <Text style={styles.descriptionText}>{disp.description || t('tournament.overview.description_placeholder')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Gallery Images */}
        {(isHost || tournament.gallery_image_1_url || tournament.gallery_image_2_url) && (
          <View style={{ marginTop: Spacing.md, paddingHorizontal: Spacing.lg }}>
            <Text style={[styles.infoCardLabel, { marginBottom: Spacing.sm }]}>{t('tournament.overview.gallery')}{isHost ? t('tournament.overview.gallery_max') : ''}</Text>
            <View style={{ flexDirection: 'column', gap: Spacing.sm }}>
              {([1, 2] as const).map(slot => {
                const imgUrl = slot === 1 ? tournament.gallery_image_1_url : tournament.gallery_image_2_url;
                return (
                  <View key={slot} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: BorderRadius.md, overflow: 'hidden', backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.border }}>
                    {imgUrl ? (
                      <>
                        <Image source={{ uri: imgUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        {isHost && (
                          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 4, padding: 6 }}>
                            <TouchableOpacity onPress={() => handleGalleryImageUpload(slot)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: 5, alignItems: 'center' }}>
                              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>{t('tournament.actions.change')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleGalleryImageRemove(slot)} style={{ flex: 1, backgroundColor: 'rgba(220,38,38,0.7)', borderRadius: 6, padding: 5, alignItems: 'center' }}>
                              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>{t('tournament.actions.delete')}</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    ) : isHost ? (
                      <TouchableOpacity onPress={() => handleGalleryImageUpload(slot)} disabled={uploading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Ionicons name="image-outline" size={24} color={Colors.textTertiary} />
                        <Text style={{ fontSize: 11, color: Colors.textSecondary, fontWeight: '600' }}>
                          {uploading ? t('tournament.actions.processing') : t('tournament.actions.add_photo')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Finish Tournament (host only) */}
        {isHost && (
          <View style={styles.finishCard}>
            {tournament.status === 'finished' ? (
              <View style={styles.finishDoneRow}>
                <Text style={styles.finishDoneIcon}>✅</Text>
                <Text style={styles.finishDoneText}>{t('tournament.overview.finished_message')}</Text>
              </View>
            ) : (
              <View style={styles.finishRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.finishLabel}>{t('tournament.overview.finish_title')}</Text>
                  <Text style={styles.finishHint}>{t('tournament.overview.finish_hint')}</Text>
                </View>
                <TouchableOpacity style={styles.finishBtn} onPress={handleFinishTournament}>
                  <Text style={styles.finishBtnText}>{t('tournament.overview.finish_btn')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Cover Image Upload — hidden on mobile */}
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
  };

  // ====== MATCHES TAB ======
  const liveMatches = sortMatchesChronologically(matches.filter((m) => m.status === 'LIVE'));

  // Build match sub-tab list: "すべて" + each stage group / tournament stage
  // Build set of child stage IDs (3位/5位/7位決定戦 etc.) to group under parent
  const childStageIds = new Set(thirdPlaceParentStageIdMap.keys());
  // Map parent stage ID → list of child stage IDs
  const childStagesByParent = new Map<number, number[]>();
  thirdPlaceParentStageIdMap.forEach((parentId, childId) => {
    const current = childStagesByParent.get(parentId) ?? [];
    current.push(childId);
    childStagesByParent.set(parentId, current);
  });

  const dispStageList = displayStages.length ? displayStages : stages;
  const dispStageById = new Map<number, StageData>(dispStageList.map(s => [s.id, s]));
  // 原文ステージ名 → AI翻訳済み名のマップ（translateStageName で使用）
  const stageNameMap: Record<string, string> = {};
  stages.forEach(s => {
    const disp = dispStageById.get(s.id);
    if (disp && disp.name !== s.name) stageNameMap[s.name] = disp.name;
  });

  const matchSubTabs = (() => {
    const tabs: { key: string; label: string; stageIds?: number[]; groupId?: number }[] = [
      ...(isRefereeUser ? [{ key: 'my_matches', label: t('tournament.match_subtabs.my_matches') }] : []),
      { key: 'board', label: t('tournament.match_subtabs.board') },
      { key: 'all', label: t('tournament.match_subtabs.all') },
    ];
    stages.forEach((stage) => {
      // Skip child stages — they are grouped under their parent
      if (childStageIds.has(stage.id)) return;
      const dispStage = dispStageById.get(stage.id) ?? stage;

      if (stage.type === 'LEAGUE') {
        const groups = [...(stage.groups ?? [])].sort((a, b) => a.order_index - b.order_index);
        const dispGroups = [...(dispStage.groups ?? [])];
        if (groups.length > 1) {
          groups.forEach((g) => {
            const dispGroup = dispGroups.find(dg => dg.id === g.id);
            tabs.push({ key: `group-${g.id}`, label: (dispGroup?.name || g.name) || dispStage.name, stageIds: [stage.id], groupId: g.id });
          });
        } else {
          tabs.push({ key: `stage-${stage.id}`, label: dispStage.name, stageIds: [stage.id] });
        }
      } else {
        // Include parent stage + its child stages (3位/5位/7位決定戦)
        const relatedIds = [stage.id, ...(childStagesByParent.get(stage.id) ?? [])];
        tabs.push({ key: `stage-${stage.id}`, label: dispStage.name, stageIds: relatedIds });
      }
    });
    return tabs;
  })();

  const renderMatches = () => {
    const activeFilter = matchSubTabs[matchSubTab] ?? matchSubTabs[0];
    const filterStageIds = new Set(activeFilter.stageIds ?? []);
    const filteredMatches = activeFilter.key === 'all'
      ? matches
      : matches.filter((m) => {
          if (activeFilter.groupId) return filterStageIds.has(m.stage_id ?? -1) && m.group_id === activeFilter.groupId;
          return filterStageIds.has(m.stage_id ?? -1);
        });
    const filteredLive = activeFilter.key === 'all'
      ? liveMatches
      : liveMatches.filter((m) => {
          if (activeFilter.groupId) return filterStageIds.has(m.stage_id ?? -1) && m.group_id === activeFilter.groupId;
          return filterStageIds.has(m.stage_id ?? -1);
        });
    const filteredStages = activeFilter.key === 'all'
      ? stages
      : stages.filter((s) => filterStageIds.has(s.id));

    return (
    <View
      style={{ flex: 1 }}
    >
      {renderSubTabs(matchSubTabs, matchSubTab, setMatchSubTab)}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.tabContent}>
          <Text style={styles.subTabPageTitle}>{activeFilter.label}</Text>
          {activeFilter.key === 'my_matches' ? (
            /* 担当試合 (referee) */
            (() => {
              const { live, upcoming, finished } = categorizeRefereeMatches();
              if (live.length === 0 && upcoming.length === 0 && finished.length === 0) {
                return <EmptyState icon="shield-outline" title={t('tournament.sections.no_assigned_matches')} />;
              }
              return (
                <>
                  {renderRefereeMatchSection(t('tournament.status.live_badge'), 'radio-outline', live, '#ef4444')}
                  {renderRefereeMatchSection(t('tournament.sections.upcoming'), 'time-outline', upcoming, '#2563eb')}
                  {renderRefereeMatchSection(t('tournament.sections.finished'), 'checkmark-circle-outline', finished, '#22c55e')}
                </>
              );
            })()
          ) : activeFilter.key === 'board' ? (
            /* 全体像 */
            (roundsWithStages.length > 0 || unroundedStages.length > 0) ? (
              <View style={styles.sectionBlock}>
                {roundsWithStages.map((round, roundIndex) => (
                  <React.Fragment key={`board-frag-${round.id}`}>
                    {roundIndex > 0 && (
                      <View style={styles.roundArrowContainer}>
                        <Ionicons name="arrow-down" size={28} color={Colors.textTertiary} />
                      </View>
                    )}
                    {renderRoundBoard(`board-round-${round.id}`, roundNameMap[round.id] ?? round.name, round.stages)}
                  </React.Fragment>
                ))}
                {unroundedStages.length > 0 && (
                  <>
                    {roundsWithStages.length > 0 && (
                      <View style={styles.roundArrowContainer}>
                        <Ionicons name="arrow-down" size={28} color={Colors.textTertiary} />
                      </View>
                    )}
                    {renderRoundBoard('board-round-unrounded', t('tournament.sections.uncategorized'), unroundedStages)}
                  </>
                )}
              </View>
            ) : (
              <EmptyState icon="grid-outline" title={t('tournament.sections.no_data')} />
            )
          ) : filteredMatches.length === 0 ? (
            <EmptyState icon="swap-horizontal-outline" title={t('tournament.sections.no_matches')} />
          ) : (
            <>
              {/* Live matches summary at top */}
              {filteredLive.length > 0 && (
                <View style={styles.liveSummarySection}>
                  <View style={styles.liveSummaryHeader}>
                    <View style={styles.liveSummaryDot} />
                    <Text style={styles.liveSummaryTitle}>LIVE</Text>
                    <Text style={styles.liveSummaryCount}>{filteredLive.length} {t('tournament.tabs.matches')}</Text>
                  </View>
                  {filteredLive.map((m) => {
                    const hName = m.home_team_name || (m.home_placeholder ? translateStageName(m.home_placeholder) : 'TBD');
                    const aName = m.away_team_name || (m.away_placeholder ? translateStageName(m.away_placeholder) : 'TBD');
                    return (
                      <TouchableOpacity
                        key={`live-${m.id}`}
                        style={styles.liveSummaryCard}
                        activeOpacity={0.7}
                        onPress={() => {
                          const isAssigned = isRefereeUser && (myTournamentData?.assigned_matches ?? []).some((am: any) => am.id === m.id);
                          if (isHost || isAssigned) {
                            setEditMatch(m);
                            setEditMode('score');
                          } else {
                            setDetailMatch(m);
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

              {filteredStages.map((stage) => {
                const stageMatches = filteredMatches.filter((m) => m.stage_id === stage.id);
                if (stageMatches.length === 0) return null;
                const groupedStageMatches = getStageMatchGroups(stage, stageMatches);
                return (
                  <View key={stage.id} style={styles.sectionBlock}>
                    {(activeFilter.key === 'all' || (activeFilter.stageIds?.length ?? 0) > 1) && <Text style={styles.sectionTitle}>{dispStageById.get(stage.id)?.name ?? translateStageName(stage.name)}</Text>}
                    {groupedStageMatches.map((group) => (
                      <View key={`${stage.id}-${group.key}`} style={styles.matchGroupBlock}>
                        {group.matches.map((m) => renderMatchItem(m))}
                      </View>
                    ))}
                  </View>
                );
              })}
              {activeFilter.key === 'all' && sortMatchesChronologically(filteredMatches.filter((m) => !stages.find((s) => s.id === m.stage_id))).length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>{t('tournament.sections.other_matches')}</Text>
                  {sortMatchesChronologically(filteredMatches.filter((m) => !stages.find((s) => s.id === m.stage_id))).map((m) => renderMatchItem(m))}
                </View>
              )}
            </>
          )}
          {/* トーナメント樹形図: 全体像でも個別サブタブでも表示 */}
          {(() => {
            const bracketGroups = activeFilter.key === 'all'
              ? (hasTournamentStages ? tournamentBracketGroups : [])
              : tournamentBracketGroups.filter(({ parent }) => filteredStages.some(s => s.id === parent.id));
            return bracketGroups.map(({ parent, children }) => (
              <View key={parent.id} style={styles.sectionBlock}>
                {activeFilter.key === 'all' && <Text style={styles.sectionTitle}>{dispStageById.get(parent.id)?.name ?? translateStageName(parent.name)}</Text>}
                <View style={styles.bracketCard}>
                  <MobileBracketViewer
                    snapshot={treeDataMap[parent.id]}
                    matches={getBracketMatches(parent.id)}
                    mode="result"
                    teams={teams}
                    slots={getBracketSlots(parent)}
                  />
                </View>
                {children.length > 0 && (
                  <View style={styles.childBracketColumn}>
                    {children.map((childStage) => (
                      <View key={childStage.id} style={styles.childBracketCard}>
                        <Text style={styles.childBracketTitle}>{dispStageById.get(childStage.id)?.name ?? translateStageName(childStage.name)}</Text>
                        <View style={styles.childBracketInner}>
                          <MobileBracketViewer
                            snapshot={treeDataMap[childStage.id]}
                            matches={getBracketMatches(childStage.id)}
                            mode="result"
                            teams={teams}
                            slots={getBracketSlots(childStage)}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ));
          })()}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
    );
  };

  // Match card: center shows only ":", time, score, or LIVE score. Tap to edit.
  const renderMatchItem = (m: MatchData) => {
    const matchIsFinished = m.status === 'FT';
    const matchIsLive = m.status === 'LIVE';
    const hasSchedule = !!m.scheduled_at;
    // Show placeholder label if no team name assigned (same logic as web displaySide)
    const homeName = m.home_team_name || (m.home_placeholder ? translateStageName(m.home_placeholder) : t('tournament.status.tbd'));
    const awayName = m.away_team_name || (m.away_placeholder ? translateStageName(m.away_placeholder) : t('tournament.status.tbd'));
    const homeHasTeam = !!m.home_team_id;
    const awayHasTeam = !!m.away_team_id;
    // TBD: either side has no team assigned yet (shows dashed border like web)
    const isTBD = !homeHasTeam || !awayHasTeam;

    // 審判は担当試合のみ編集可能
    const isAssignedReferee = isRefereeUser && (myTournamentData?.assigned_matches ?? []).some((am: any) => am.id === m.id);
    const canEdit = isHost || isAssignedReferee;

    const handleCardTap = () => {
      if (!canEdit) {
        // 終了した試合は誰でも結果を閲覧可能
        if (matchIsFinished) {
          setEditMatch(m);
          setEditMode('score');
          return;
        }
        return;
      }
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
        style={[
          styles.matchItemCard,
          matchIsLive && styles.matchItemCardLive,
          isTBD && !matchIsFinished && !matchIsLive && styles.matchItemCardTBD,
        ]}
        activeOpacity={0.7}
        onPress={isHost ? handleCardTap : () => setDetailMatch(m)}
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
  const standingsSubTabs = (() => {
    const tabs: { key: string; label: string; roundId?: number }[] = [
      { key: 'all', label: t('tournament.match_subtabs.all') },
    ];
    const sortedRnds = rounds.slice().sort((a, b) => a.order_index - b.order_index);
    sortedRnds.forEach((r) => {
      const hasLeague = stages.some((s) => s.type === 'LEAGUE' && s.round_id === r.id);
      const hasBracket = stages.some((s) => s.type === 'TOURNAMENT' && s.round_id === r.id);
      if (hasLeague || hasBracket) {
        tabs.push({ key: `round-${r.id}`, label: roundNameMap[r.id] ?? r.name, roundId: r.id });
      }
    });
    return tabs;
  })();

  const renderStandings = () => {
    const leagueStages = stages.filter((s) => s.type === 'LEAGUE');
    const sortedRounds = rounds.slice().sort((a, b) => a.order_index - b.order_index);
    const roundsWithLeagues = sortedRounds
      .map((r) => ({ round: r, leagueStages: leagueStages.filter((s) => s.round_id === r.id) }))
      .filter((rg) => rg.leagueStages.length > 0);
    const roundedStageIds = new Set(roundsWithLeagues.flatMap((rg) => rg.leagueStages.map((s) => s.id)));
    const unroundedLeagues = leagueStages.filter((s) => !roundedStageIds.has(s.id));
    const hasAnyLeague = leagueStages.length > 0;

    const activeFilter = standingsSubTabs[standingsSubTab] ?? standingsSubTabs[0];
    const filteredRoundsWithLeagues = activeFilter.key === 'all'
      ? roundsWithLeagues
      : roundsWithLeagues.filter((rg) => rg.round.id === activeFilter.roundId);
    const showUnrounded = activeFilter.key === 'all';
    const filteredBracketGroups = activeFilter.key === 'all'
      ? tournamentBracketGroups
      : tournamentBracketGroups.filter(({ parent }) => parent.round_id === activeFilter.roundId);

    return (
    <View
      style={{ flex: 1 }}
    >
      {standingsSubTabs.length > 2 && renderSubTabs(standingsSubTabs, standingsSubTab, setStandingsSubTab)}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.tabContent}>
          <Text style={styles.subTabPageTitle}>{activeFilter.label}</Text>
          {hasAnyLeague ? (
            <>
              {filteredRoundsWithLeagues.map(({ round, leagueStages: rLeagues }) => (
                <View key={round.id}>
                  {activeFilter.key === "all" && <Text style={styles.roundSectionTitle}>{roundNameMap[round.id] ?? round.name}</Text>}
                  {rLeagues.map((stage) => {
                    const stageStandings = standings[stage.id];
                    if (!stageStandings?.groups?.length) return null;
                    const dispStage = dispStageById.get(stage.id) ?? stage;
                    const stageGroupMap = new Map((dispStage.groups ?? stage.groups ?? []).map((sg) => [sg.id, sg.name]));
                    return (
                      <View key={stage.id}>
                        <Text style={styles.sectionTitle}>{dispStage.name}</Text>
                        {stageStandings.groups.map((g) => (
                          <StandingsTable
                            key={g.group_id}
                            rows={g.rows ?? []}
                            groupName={
                              stageStandings.groups.length === 1
                                ? undefined
                                : (stageGroupMap.get(g.group_id) || g.group_name || dispStage.name)
                            }
                            highlightTeamId={user?.teamId}
                            onTeamPress={(teamId) => router.push(`/tournament/${slug}/team/${teamId}`)}
                          />
                        ))}
                      </View>
                    );
                  })}
                </View>
              ))}
              {showUnrounded && unroundedLeagues.map((stage) => {
                const stageStandings = standings[stage.id];
                if (!stageStandings?.groups?.length) return null;
                const dispStage = dispStageById.get(stage.id) ?? stage;
                const stageGroupMap = new Map((dispStage.groups ?? stage.groups ?? []).map((sg) => [sg.id, sg.name]));
                return (
                  <View key={stage.id}>
                    <Text style={styles.sectionTitle}>{dispStage.name}</Text>
                    {stageStandings.groups.map((g) => (
                      <StandingsTable
                        key={g.group_id}
                        rows={g.rows ?? []}
                        groupName={
                          stageStandings.groups.length === 1
                            ? undefined
                            : (stageGroupMap.get(g.group_id) || g.group_name || dispStage.name)
                        }
                        highlightTeamId={user?.teamId}
                        onTeamPress={(teamId) => router.push(`/tournament/${slug}/team/${teamId}`)}
                      />
                    ))}
                  </View>
                );
              })}
            </>
          ) : !hasTournamentStages ? (
            <EmptyState icon="podium-outline" title={t('tournament.sections.no_standings')} message={t('tournament.sections.no_standings_hint')} />
          ) : null}

          {/* トーナメント順位表 (ウェブ版と同じロジック) */}
          {(() => {
            const childStageIdSet = new Set(thirdPlaceParentStageIdMap.keys());
            const filteredRoundIds = activeFilter.key === 'all'
              ? null
              : activeFilter.roundId != null ? new Set([activeFilter.roundId]) : null;

            const roundsToShow = rounds
              .slice()
              .sort((a, b) => a.order_index - b.order_index)
              .filter(r => !filteredRoundIds || filteredRoundIds.has(r.id));

            return roundsToShow.map(r => {
              const roundStages = stages.filter(s => s.round_id === r.id);
              const rankings = calcMobileTournamentRankings(
                roundStages, matches, teams, childStageIdSet, treeDataMap,
              );
              if (rankings.length === 0) return null;
              return (
                <View key={`rank-${r.id}`} style={styles.rankingCard}>
                  <View style={styles.rankingHeader}>
                    <Text style={styles.rankingHeaderText}>🏆 {roundNameMap[r.id] ?? r.name} {t("tournament.sections.tournament_rankings_title")}</Text>
                  </View>
                  <View style={styles.rankingTableHeader}>
                    <Text style={[styles.rankingCell, styles.rankingCellRank, styles.rankingHeaderLabel]}>{t('tournament.sections.rank_col')}</Text>
                    <Text style={[styles.rankingCell, styles.rankingCellTeam, styles.rankingHeaderLabel]}>{t('tournament.sections.team_col')}</Text>
                  </View>
                  {rankings.map((entry, idx) => {
                    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
                    return (
                      <View key={`${entry.rank}-${entry.teamId}`} style={[styles.rankingRow, idx % 2 === 1 && styles.rankingRowAlt]}>
                        <View style={[styles.rankingCell, styles.rankingCellRank]}>
                          {medal
                            ? <Text style={styles.rankingMedal}>{medal}</Text>
                            : <Text style={styles.rankingRankNum}>#{entry.rank}</Text>}
                        </View>
                        <Text style={[styles.rankingCell, styles.rankingCellTeam, entry.rank <= 3 && styles.rankingTeamBold]}>
                          {entry.teamId == null ? t('tournament.sections.team_not_confirmed') : entry.teamName}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            });
          })()}

          {filteredBracketGroups.map(({ parent, children }) => (
            <View key={parent.id} style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{dispStageById.get(parent.id)?.name ?? translateStageName(parent.name)}</Text>
              <View style={styles.bracketCard}>
                <MobileBracketViewer
                  snapshot={treeDataMap[parent.id]}
                  matches={getBracketMatches(parent.id)}
                  mode="result"
                  teams={teams}
                  slots={getBracketSlots(parent)}
                />
              </View>
              {children.length > 0 && (
                <View style={styles.childBracketColumn}>
                  {children.map((childStage) => (
                    <View key={childStage.id} style={styles.childBracketCard}>
                      <Text style={styles.childBracketTitle}>{dispStageById.get(childStage.id)?.name ?? translateStageName(childStage.name)}</Text>
                      <View style={styles.childBracketInner}>
                        <MobileBracketViewer
                          snapshot={treeDataMap[childStage.id]}
                          matches={getBracketMatches(childStage.id)}
                          mode="result"
                          teams={teams}
                          slots={getBracketSlots(childStage)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
    );
  };

  // ====== SHARED ROUND BOARD HELPERS ======
  const SLOT_COLUMNS = 4;
  const roundsWithStages = rounds
    .map((r) => ({ ...r, stages: stages.filter((s) => s.round_id === r.id) }))
    .filter((r) => r.stages.length > 0)
    .sort((a, b) => a.order_index - b.order_index);
  const unroundedStages = stages.filter((s) => !s.round_id);
  const allStageIds = new Set(stages.map((s) => s.id));

  const chunkByColumns = <T,>(items: T[], columnSize: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += columnSize) {
      chunks.push(items.slice(i, i + columnSize));
    }
    return chunks;
  };

  const resolveSlotEntry = (slot: SlotData): RoundBoardEntry => {
    const resolvedTeam = slot.team_id ? teamMap.get(slot.team_id) : null;
    const placeholderName = slot.placeholder_label
      ? translateStageName(slot.placeholder_label)
      : (slot.name ? translateStageName(slot.name) : t('tournament.status.tbd'));
    return {
      name: resolvedTeam?.name || placeholderName,
      logoUrl: resolvedTeam?.logo_url ?? null,
    };
  };

  const getRoundBoardRows = (stageList: StageData[]): RoundBoardRow[] => {
      const rows: RoundBoardRow[] = [];
      let colorIdx = 0;
      sortStagesByOrder(stageList).forEach((stage) => {
        const sortedGroups = [...(stage.groups ?? [])]
          .sort((a, b) => a.order_index - b.order_index);

        // AI翻訳済みの名前を優先して使用
        const dispName = dispStageById.get(stage.id)?.name ?? stage.name;

        if (stage.type === 'LEAGUE') {
          const dispStage = dispStageById.get(stage.id) ?? stage;
          const dispGroups = [...(dispStage.groups ?? [])];
          sortedGroups.forEach((group) => {
            const entries = [...(group.slots ?? [])]
              .sort((a, b) => a.order_index - b.order_index)
              .map(resolveSlotEntry);
            if (entries.length === 0) return;
            // グループが1つの場合はステージ名（大会構成で設定した名前）を使用
            // グループが複数の場合は表示グループ名を使用（サブタブと同じロジック）
            const dispGroup = dispGroups.find(dg => dg.id === group.id);
            const groupLabel = sortedGroups.length === 1
              ? dispName
              : ((dispGroup?.name || group.name) || dispName);
            rows.push({
              id: `league-${stage.id}-${group.id}`,
              stageId: stage.id,
              label: groupLabel,
              stageName: dispName,
              stageType: 'LEAGUE',
              entries,
              colorIndex: colorIdx++,
            });
          });
          return;
        }

        if (stage.type === 'TOURNAMENT') {
          if (sortedGroups.length === 0) return;
          const entries = sortedGroups
            .flatMap((group) => [...(group.slots ?? [])])
            .sort((a, b) => a.order_index - b.order_index)
            .map(resolveSlotEntry);
          if (entries.length === 0) return;
          const childIds = getChildTournamentStages(stage.id, allStageIds)
            .filter((cs) => treeDataMap[cs.id]?.nodes?.length > 0)
            .map((cs) => cs.id);
          rows.push({
            id: `tournament-${stage.id}`,
            stageId: stage.id,
            label: dispName,
            stageName: dispName,
            stageType: 'TOURNAMENT',
            entries,
            colorIndex: colorIdx++,
            childStageIds: childIds,
          });
        }
      });
      return rows;
    };

  const renderRoundBoard = (key: string, roundName: string, stageList: StageData[]) => {
      const boardRows = getRoundBoardRows(stageList);
      if (boardRows.length === 0) return null;
      const dateRange = getRoundDateRange(stageList);
      return (
        <View key={key} style={styles.roundBoardCard}>
          {/* Round header with date box top-right */}
          <View style={styles.roundBoardHeader}>
            <Text
              style={styles.roundBoardTitle}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {roundName}
            </Text>
            {dateRange ? (
              <View style={styles.roundBoardDateBox}>
                <Text style={styles.roundBoardDateBoxText}>{dateRange}</Text>
              </View>
            ) : null}
          </View>
          {/* Stage groups */}
          <View style={styles.roundBoardRows}>
            {boardRows.map((row) => {
              const palette = ROUND_BOARD_PALETTE[row.colorIndex % ROUND_BOARD_PALETTE.length];
              const teamLines = chunkByColumns(row.entries, SLOT_COLUMNS);
              return (
                <View key={row.id} style={[styles.roundBoardGroup, { borderColor: palette.border }]}>
                  {/* Group label */}
                  <View style={[styles.roundBoardGroupHeader, { backgroundColor: palette.border + '12' }]}>
                    <Ionicons
                      name={row.stageType === 'LEAGUE' ? 'list-outline' : 'git-merge-outline'}
                      size={14}
                      color={palette.text}
                    />
                    <Text style={[styles.roundBoardGroupLabel, { color: palette.text }]}>{row.label}</Text>
                    <View style={[styles.roundBoardGroupTypeBadge, { backgroundColor: palette.border + '20' }]}>
                      <Text style={[styles.roundBoardGroupTypeText, { color: palette.text }]}>
                        {row.stageType === 'LEAGUE' ? t('tournament.format.league') : t('tournament.format.tournament')}
                      </Text>
                    </View>
                  </View>
                  {/* Team grid */}
                  <View style={styles.roundBoardTeamGrid}>
                    {teamLines.map((line, lineIndex) => (
                      <View key={`${row.id}-${lineIndex}`} style={styles.roundBoardTeamLine}>
                        {line.map((entry, entryIndex) => (
                          <TouchableOpacity
                            key={`${row.id}-${lineIndex}-${entryIndex}`}
                            style={styles.roundBoardTeamCard}
                            activeOpacity={0.7}
                            onPress={() => setBoardTeamPopup(entry.name)}
                          >
                            {entry.logoUrl ? (
                              <Image source={{ uri: entry.logoUrl }} style={styles.roundBoardTeamLogo} />
                            ) : (
                              <View style={styles.roundBoardTeamLogoPlaceholder}>
                                <Text style={styles.roundBoardTeamLogoText}>{entry.name.charAt(0).toUpperCase()}</Text>
                              </View>
                            )}
                            <Text
                              style={styles.roundBoardTeamName}
                              numberOfLines={2}
                              adjustsFontSizeToFit
                              minimumFontScale={0.7}
                            >
                              {entry.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {line.length < SLOT_COLUMNS && Array.from({ length: SLOT_COLUMNS - line.length }).map((_, emptyIndex) => (
                          <View
                            key={`${row.id}-${lineIndex}-empty-${emptyIndex}`}
                            style={[styles.roundBoardTeamCard, { borderWidth: 0, backgroundColor: 'transparent' }]}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                  {/* Bracket accordion for tournament stages */}
                  {row.stageType === 'TOURNAMENT' && treeDataMap[row.stageId]?.nodes?.length > 0 && (() => {
                    const stageObj = stages.find((s) => s.id === row.stageId);
                    if (!stageObj) return null;
                    const isBracketOpen = !!expandedBoardBrackets[row.stageId];
                    return (
                      <View>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setExpandedBoardBrackets(prev => ({ ...prev, [row.stageId]: !prev[row.stageId] }))}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#e2e8f0' }}
                        >
                          <Ionicons name="git-merge-outline" size={14} color={Colors.primary} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary }}>{isBracketOpen ? t('tournament.sections.bracket_hide') : t('tournament.sections.bracket_show')}</Text>
                          <Ionicons name={isBracketOpen ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
                        </TouchableOpacity>
                        {isBracketOpen && (
                          <View style={styles.roundBoardBracketWrap}>
                            <MobileBracketViewer
                              snapshot={treeDataMap[row.stageId]}
                              matches={getBracketMatches(row.stageId)}
                              mode="result"
                              teams={teams}
                              slots={getBracketSlots(stageObj)}
                            />
                          </View>
                        )}
                        {/* Child bracket stages (e.g. 3位決定戦) */}
                        {isBracketOpen && (row.childStageIds ?? []).map((childId) => {
                          const childStage = stages.find((s) => s.id === childId);
                          if (!childStage || !treeDataMap[childId]?.nodes?.length) return null;
                          return (
                            <View key={`child-bracket-${childId}`} style={styles.roundBoardBracketWrap}>
                              <Text style={styles.roundBoardChildLabel}>{dispStageById.get(childStage.id)?.name ?? translateStageName(childStage.name)}</Text>
                              <MobileBracketViewer
                                snapshot={treeDataMap[childId]}
                                matches={getBracketMatches(childId)}
                                mode="result"
                                teams={teams}
                                slots={getBracketSlots(childStage)}
                              />
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
              );
            })}
          </View>
        </View>
      );
  };

  // ====== OVERALL TAB ======
  const renderOverall = () => {
    const renderStageAccordion = (item: StageDisplayItem) => {
      const { stage, isChild, parentStage } = item;
      const expanded = !!expandedStageMap[stage.id];
      const childBracketStages = getChildTournamentStages(stage.id, allStageIds)
        .filter((childStage) => treeDataMap[childStage.id]?.nodes?.length > 0);
      return (
        <View key={stage.id} style={styles.stageAccordionItem}>
          <TouchableOpacity
            style={styles.stageAccordionTrigger}
            activeOpacity={0.75}
            onPress={() => toggleStageAccordion(stage.id)}
          >
            <Ionicons
              name={stage.type === 'LEAGUE' ? 'list-outline' : 'git-merge-outline'}
              size={16}
              color={Colors.primary}
            />
            <View style={styles.stageNameWrap}>
              <Text style={styles.stageInfoName}>{dispStageById.get(stage.id)?.name ?? translateStageName(stage.name)}</Text>
            </View>
            <View style={[styles.stageTypeBadge, { backgroundColor: stage.type === 'LEAGUE' ? Colors.successLight : Colors.warningLight }]}>
              <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: stage.type === 'LEAGUE' ? Colors.success : Colors.warning }}>
                {stage.type === 'LEAGUE' ? t('tournament.format.league') : t('tournament.format.tournament')}
              </Text>
            </View>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>

          {expanded && (
            <View style={styles.stageAccordionContent}>
              {stage.type === 'TOURNAMENT' ? (
                treeDataMap[stage.id]?.nodes?.length > 0 ? (
                  <View style={styles.stageBracketGroup}>
                    <View style={styles.stageBracketWrap}>
                      <MobileBracketViewer
                        snapshot={treeDataMap[stage.id]}
                        matches={getBracketMatches(stage.id)}
                        mode="result"
                        teams={teams}
                        slots={getBracketSlots(stage)}
                        fixedPlaceholders
                      />
                    </View>
                    {childBracketStages.length > 0 && (
                      <View style={styles.childBracketColumn}>
                        {childBracketStages.map((childStage) => (
                          <View key={childStage.id} style={styles.childBracketCard}>
                            <Text style={styles.childBracketTitle}>{dispStageById.get(childStage.id)?.name ?? translateStageName(childStage.name)}</Text>
                            <View style={styles.childBracketInner}>
                              <MobileBracketViewer
                                snapshot={treeDataMap[childStage.id]}
                                matches={getBracketMatches(childStage.id)}
                                mode="result"
                                teams={teams}
                                slots={getBracketSlots(childStage)}
                                fixedPlaceholders
                              />
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.emptySlotText}>{t('tournament.sections.no_bracket')}</Text>
                )
              ) : stage.groups && stage.groups.length > 0 ? (
                <View style={styles.placementGroups}>
                  {stage.groups.map((group) => (
                    <View key={group.id} style={styles.placementGroup}>
                      <Text style={styles.placementGroupTitle}>{group.name}</Text>
                      {group.slots && group.slots.length > 0 ? (
                        [...group.slots]
                          .sort((a, b) => a.order_index - b.order_index)
                          .map((slot) => {
                            const slotTeam = slot.team_id ? teamMap.get(slot.team_id) : null;
                            return (
                              <View key={slot.id} style={styles.slotRow}>
                                {slotTeam?.logo_url ? (
                                  <Image source={{ uri: slotTeam.logo_url }} style={styles.slotTeamLogo} />
                                ) : (
                                  <View style={styles.slotTeamLogoPlaceholder}>
                                    <Text style={styles.slotTeamLogoText}>
                                      {(slotTeam?.name || translateStageName(slot.placeholder_label || slot.name || '?')).charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                <Text style={styles.slotName} numberOfLines={1}>
                                  {slotTeam ? slotTeam.name : translateStageName(slot.placeholder_label || slot.name || '—')}
                                </Text>
                              </View>
                            );
                          })
                      ) : (
                        <Text style={styles.emptySlotText}>{t('tournament.sections.team_unassigned')}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptySlotText}>{t('tournament.sections.no_group')}</Text>
              )}
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.tabContent}>
          {(roundsWithStages.length > 0 || unroundedStages.length > 0) ? (
            <View style={styles.sectionBlock}>
              {roundsWithStages.map((round) => (
                <View key={round.id} style={styles.roundCard}>
                  <View style={styles.roundCardHeader}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.roundCardTitle}>{roundNameMap[round.id] ?? round.name}</Text>
                      <Text style={styles.roundDateText}>{getRoundDateRange(round.stages)}</Text>
                    </View>
                    <View style={[styles.roundStatusBadge, { backgroundColor: round.status === 'FINALIZED' ? Colors.successLight : round.status === 'ACTIVE' ? Colors.warningLight : Colors.surfaceSecondary }]}>
                      <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: round.status === 'FINALIZED' ? Colors.success : round.status === 'ACTIVE' ? Colors.warning : Colors.textTertiary }}>
                        {round.status === 'FINALIZED' ? t('tournament.status.confirmed') : round.status === 'ACTIVE' ? t('tournament.status.in_progress') : t('tournament.status.draft')}
                      </Text>
                    </View>
                  </View>
                  {buildStageDisplayItems(round.stages).map((item) => renderStageAccordion(item))}
                </View>
              ))}

              {unroundedStages.length > 0 && (
                <View style={styles.roundCard}>
                  <View style={styles.roundCardHeader}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.roundCardTitle}>{t('tournament.sections.uncategorized')}</Text>
                      <Text style={styles.roundDateText}>{getRoundDateRange(unroundedStages)}</Text>
                    </View>
                  </View>
                  {buildStageDisplayItems(unroundedStages).map((item) => renderStageAccordion(item))}
                </View>
              )}
            </View>
          ) : (
            <EmptyState icon="layers-outline" title={t('tournament.sections.no_stages')} />
          )}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    );
  };

  // ====== TEAMS TAB ======
  const renderTeams = () => {
    const dispTeamList = displayTeams.length ? displayTeams : teams;
    const myTeamId = myTournamentData?.team_id ?? user?.teamId ?? null;
    const hasMyTeam = !!myTeamId;
    const myTeam = hasMyTeam ? dispTeamList.find((t) => t.id === myTeamId) : null;
    const otherTeams = hasMyTeam ? dispTeamList.filter((t) => t.id !== myTeamId) : dispTeamList;

    // My team matches
    const myTeamMatches = hasMyTeam
      ? matches.filter((m) => m.home_team_id === myTeamId || m.away_team_id === myTeamId)
      : [];
    const myLiveMatches = myTeamMatches.filter((m) => m.status === 'LIVE');
    const myUpcomingMatches = sortMatchesChronologically(
      myTeamMatches.filter((m) => m.status !== 'FT' && m.status !== 'finished' && m.status !== 'LIVE'),
    );
    const myFinishedMatches = myTeamMatches.filter((m) => m.status === 'FT' || m.status === 'finished');

    const renderMyTeamMatch = (m: MatchData) => {
      const isHome = m.home_team_id === myTeamId;
      const opponentName = isHome
        ? (m.away_team_name || (m.away_placeholder ? translateStageName(m.away_placeholder) : t('tournament.status.tbd')))
        : (m.home_team_name || (m.home_placeholder ? translateStageName(m.home_placeholder) : t('tournament.status.tbd')));
      const opponentLogo = isHome
        ? teams.find((t) => t.id === m.away_team_id)?.logo_url
        : teams.find((t) => t.id === m.home_team_id)?.logo_url;
      const isFinished = m.status === 'FT' || m.status === 'finished';
      const isLive = m.status === 'LIVE';
      const myScore = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
      const opScore = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
      const resultText = isFinished || isLive ? `${myScore} - ${opScore}` : 'vs';
      return (
        <View key={m.id} style={[styles.myTeamMatchRow, isLive && { borderLeftColor: Colors.error, borderLeftWidth: 3 }]}>
          <Text style={[styles.myTeamMatchScore, isLive && { color: Colors.error }]}>
            {resultText}
          </Text>
          {opponentLogo ? (
            <Image source={{ uri: opponentLogo }} style={styles.myTeamMatchOpLogo} />
          ) : (
            <View style={styles.myTeamMatchOpLogoPlaceholder}>
              <Text style={styles.myTeamMatchOpLogoText}>{opponentName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.myTeamMatchTeam} numberOfLines={1}>{opponentName}</Text>
        </View>
      );
    };

    return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.tabContent}>
        {/* My Team Hero */}
        {myTeam && (
          <View style={styles.sectionBlock}>
            <TouchableOpacity
              style={styles.myTeamHero}
              activeOpacity={0.7}
              onPress={() => router.push(`/tournament/${slug}/team/${myTeam.id}`)}
            >
              <View style={styles.myTeamHeroBadge}>
                <Ionicons name="star" size={12} color={Colors.primary} />
                <Text style={styles.myTeamHeroBadgeText}>{t('tournament.sections.my_team')}</Text>
              </View>
              {myTeam.logo_url ? (
                <Image source={{ uri: myTeam.logo_url }} style={styles.myTeamHeroLogo} />
              ) : (
                <View style={styles.myTeamHeroLogoPlaceholder}>
                  <Text style={styles.myTeamHeroLogoText}>{myTeam.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.myTeamHeroName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {myTeam.name}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>

            {/* Live */}
            {myLiveMatches.length > 0 && (
              <View style={styles.myTeamMatchSection}>
                <View style={styles.myTeamMatchHeader}>
                  <View style={[styles.myTeamMatchDot, { backgroundColor: Colors.error }]} />
                  <Text style={[styles.myTeamMatchHeaderText, { color: Colors.error }]}>LIVE</Text>
                </View>
                {myLiveMatches.map(renderMyTeamMatch)}
              </View>
            )}
            {/* Upcoming */}
            {myUpcomingMatches.length > 0 && (
              <View style={styles.myTeamMatchSection}>
                <Text style={styles.myTeamMatchHeaderText}>{t('tournament.sections.upcoming')}</Text>
                {myUpcomingMatches.map(renderMyTeamMatch)}
              </View>
            )}
            {/* Finished */}
            {myFinishedMatches.length > 0 && (
              <View style={styles.myTeamMatchSection}>
                <Text style={[styles.myTeamMatchHeaderText, { color: Colors.textTertiary }]}>{t('tournament.sections.finished')}</Text>
                {myFinishedMatches.map(renderMyTeamMatch)}
              </View>
            )}
          </View>
        )}

        {/* All Teams */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{t('tournament.sections.team_list')}</Text>
          {otherTeams.length === 0 && !myTeam ? (
            <EmptyState icon="people-outline" title={t('tournament.sections.no_teams')} />
          ) : (
            <View style={styles.teamGrid}>
              {otherTeams.map((team) => {
                const cardSize = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 2) / 3;
                return (
                  <TouchableOpacity
                    key={team.id}
                    style={[styles.teamGridItem, { width: cardSize, height: cardSize }]}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/tournament/${slug}/team/${team.id}`)}
                  >
                    {team.logo_url ? (
                      <Image source={{ uri: team.logo_url }} style={styles.teamGridLogo} />
                    ) : (
                      <View style={styles.teamGridLogoPlaceholder}>
                        <Text style={styles.teamGridLogoText}>{team.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text
                      style={styles.teamGridName}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {team.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
    );
  };

  // Shared helpers (used by renderMyPage, renderRefereeMatches, etc.)
  const teamName = (id: number | null) => {
    if (!id) return null;
    const dispTeams = displayTeams.length ? displayTeams : teams;
    return dispTeams.find(t => t.id === id)?.name ?? null;
  };
  const fmtScore = (m: { home_score: number | null; away_score: number | null }) =>
    m.home_score != null && m.away_score != null ? `${m.home_score} - ${m.away_score}` : 'vs';

  const renderMyPage = () => {
    const fmtTime = (iso: string | null) => {
      if (!iso) return t('tournament.overview.not_set');
      const d = new Date(iso);
      return `${(d.getMonth()+1)}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    };

    // Captain/Guest: use existing matches state filtered by teamId
    if (isCaptainHere || isGuestHere) {
      const myTeamId = user?.teamId;
      const myTeamMatches = myTeamId
        ? matches.filter(m => m.home_team_id === myTeamId || m.away_team_id === myTeamId)
        : [];
      const nextMatch = myTeamMatches.find(m => m.status !== 'FT' && m.status !== 'finished') ?? null;
      const finishedMatches = myTeamMatches.filter(m => m.status === 'FT' || m.status === 'finished');

      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}>
          <Text style={styles.sectionTitle}>{t('tournament.sections.my_page_title')}</Text>
          {/* ユーザー情報 + 言語切り替え */}
          <View style={[styles.mypageCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, marginRight: Spacing.sm }}>
              <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: Colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {user?.displayName || '---'}
              </Text>
              {user?.teamName && (
                <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 }} numberOfLines={1} ellipsizeMode="tail">
                  {user.teamName}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row' }}>
              {(['ja', 'en'] as const).map(lang => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setContentLang(lang)}
                  disabled={translating}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    marginLeft: 4,
                    borderRadius: 6,
                    backgroundColor: contentLang === lang ? Colors.primary : Colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: contentLang === lang ? Colors.primary : Colors.border,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: contentLang === lang ? '#fff' : Colors.textSecondary }}>
                    {lang === 'ja' ? 'JA' : 'EN'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* 次の試合 */}
          <View style={styles.mypageCard}>
            <Text style={styles.mypageCardTitle}>{t('tournament.sections.next_match')}</Text>
            {nextMatch ? (
              <View style={styles.mypageMatchRow}>
                <Text style={styles.mypageMatchTeam} numberOfLines={1}>
                  {nextMatch.home_team_name || nextMatch.home_placeholder || '---'}
                </Text>
                <View style={styles.mypageScoreBadge}>
                  <Text style={styles.mypageScoreText}>{fmtScore(nextMatch)}</Text>
                </View>
                <Text style={styles.mypageMatchTeam} numberOfLines={1}>
                  {nextMatch.away_team_name || nextMatch.away_placeholder || '---'}
                </Text>
              </View>
            ) : (
              <Text style={styles.mypageEmpty}>{t('tournament.sections.no_upcoming')}</Text>
            )}
            {nextMatch?.scheduled_at && (
              <Text style={styles.mypageMatchMeta}>{fmtTime(nextMatch.scheduled_at)}{nextMatch.venue ? `  📍${nextMatch.venue}` : ''}</Text>
            )}
          </View>
          {/* 成績 */}
          {finishedMatches.length > 0 && (
            <View style={styles.mypageCard}>
              <Text style={styles.mypageCardTitle}>{t('tournament.sections.my_record')}</Text>
              {finishedMatches.map(m => (
                <View key={m.id} style={styles.mypageResultRow}>
                  <Text style={styles.mypageResultTeam} numberOfLines={1}>
                    {m.home_team_name || translateStageName(m.home_placeholder || '') || '---'}
                  </Text>
                  <Text style={styles.mypageResultScore}>{fmtScore(m)}</Text>
                  <Text style={styles.mypageResultTeam} numberOfLines={1}>
                    {m.away_team_name || translateStageName(m.away_placeholder || '') || '---'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      );
    }

    // Unified account (role='user') — team_guest or representative: show next match + results
    if (isUserAccount && myTournamentData?.role && ['team_guest', 'representative'].includes(myTournamentData.role as string)) {
      const myTeamId = myTournamentData.team_id ?? null;
      const myTeamMatches = myTeamId
        ? matches.filter(m => m.home_team_id === myTeamId || m.away_team_id === myTeamId)
        : [];
      const nextMatch = myTournamentData.next_match ?? (myTeamMatches.find(m => m.status !== 'FT' && m.status !== 'finished') ?? null);
      const finishedMatches = myTeamMatches.filter(m => m.status === 'FT' || m.status === 'finished');

      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}>
          <Text style={styles.sectionTitle}>{t('tournament.sections.my_page_title')}</Text>
          {/* ユーザー情報 + 言語切り替え */}
          <View style={[styles.mypageCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, marginRight: Spacing.sm }}>
              <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: Colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {user?.displayName || '---'}
              </Text>
              {user?.teamName && (
                <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 }} numberOfLines={1} ellipsizeMode="tail">
                  {user.teamName}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row' }}>
              {(['ja', 'en'] as const).map(lang => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setContentLang(lang)}
                  disabled={translating}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    marginLeft: 4,
                    borderRadius: 6,
                    backgroundColor: contentLang === lang ? Colors.primary : Colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: contentLang === lang ? Colors.primary : Colors.border,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: contentLang === lang ? '#fff' : Colors.textSecondary }}>
                    {lang === 'ja' ? 'JA' : 'EN'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.mypageCard}>
            <Text style={styles.mypageCardTitle}>{t('tournament.sections.next_match')}</Text>
            {nextMatch ? (
              <View style={styles.mypageMatchRow}>
                <Text style={styles.mypageMatchTeam} numberOfLines={1}>
                  {teamName(nextMatch.home_team_id) || nextMatch.home_placeholder || '---'}
                </Text>
                <View style={styles.mypageScoreBadge}>
                  <Text style={styles.mypageScoreText}>{fmtScore(nextMatch)}</Text>
                </View>
                <Text style={styles.mypageMatchTeam} numberOfLines={1}>
                  {teamName(nextMatch.away_team_id) || nextMatch.away_placeholder || '---'}
                </Text>
              </View>
            ) : (
              <Text style={styles.mypageEmpty}>{t('tournament.sections.no_upcoming')}</Text>
            )}
            {nextMatch?.scheduled_at && (
              <Text style={styles.mypageMatchMeta}>{fmtTime(nextMatch.scheduled_at)}{nextMatch.venue ? `  📍${nextMatch.venue}` : ''}</Text>
            )}
          </View>
        </ScrollView>
      );
    }

    // Referee (role='user'): show assigned matches
    if (isUserAccount) {
      const assignedMatches = myTournamentData?.assigned_matches ?? [];
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}>
          <Text style={styles.sectionTitle}>{t('tournament.sections.assigned_matches')}</Text>
          {/* ユーザー情報 + 言語切り替え */}
          <View style={[styles.mypageCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, marginRight: Spacing.sm }}>
              <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: Colors.text }} numberOfLines={1} ellipsizeMode="tail">
                {user?.displayName || '---'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {(['ja', 'en'] as const).map(lang => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setContentLang(lang)}
                  disabled={translating}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    marginLeft: 4,
                    borderRadius: 6,
                    backgroundColor: contentLang === lang ? Colors.primary : Colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: contentLang === lang ? Colors.primary : Colors.border,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: contentLang === lang ? '#fff' : Colors.textSecondary }}>
                    {lang === 'ja' ? 'JA' : 'EN'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {assignedMatches.length === 0 ? (
            <View style={styles.mypageCard}>
              <Text style={styles.mypageEmpty}>{t('tournament.sections.no_assigned_matches')}</Text>
            </View>
          ) : (
            assignedMatches.map(m => {
              const homeTeam = teamName(m.home_team_id);
              const awayTeam = teamName(m.away_team_id);
              const isFinished = m.status === 'FT' || m.status === 'finished';
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.mypageCard, { gap: 8 }]}
                  onPress={() => {
                    const matchData: any = {
                      ...m,
                      home_team_name: homeTeam,
                      away_team_name: awayTeam,
                    };
                    setEditMatch(matchData);
                    setEditMode('score');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.mypageMatchRow}>
                    <Text style={styles.mypageMatchTeam} numberOfLines={1}>
                      {homeTeam || translateStageName(m.home_placeholder || '') || '---'}
                    </Text>
                    <View style={[styles.mypageScoreBadge, isFinished && { backgroundColor: '#dcfce7' }]}>
                      <Text style={[styles.mypageScoreText, isFinished && { color: '#16a34a' }]}>
                        {fmtScore(m)}
                      </Text>
                    </View>
                    <Text style={styles.mypageMatchTeam} numberOfLines={1}>
                      {awayTeam || translateStageName(m.away_placeholder || '') || '---'}
                    </Text>
                  </View>
                  <Text style={styles.mypageMatchMeta}>
                    {fmtTime(m.scheduled_at)}{m.venue ? `  📍${m.venue}` : ''}
                  </Text>
                  {!isFinished && (
                    <View style={styles.mypageEnterBtn}>
                      <Ionicons name="create-outline" size={14} color={Colors.primary} />
                      <Text style={styles.mypageEnterBtnText}>{t('tournament.match_detail.enter_score')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}>
        <Text style={styles.mypageEmpty}>{t('tournament.not_found')}</Text>
      </ScrollView>
    );
  };

  /* ── Referee matches renderer (担当試合 tab + modal) ── */
  const categorizeRefereeMatches = () => {
    const assigned = myTournamentData?.assigned_matches ?? [];
    const live: typeof assigned = [];
    const upcoming: typeof assigned = [];
    const finished: typeof assigned = [];
    for (const m of assigned) {
      if (m.status === 'LIVE' || m.status === 'live') live.push(m);
      else if (m.status === 'FT' || m.status === 'finished') finished.push(m);
      else upcoming.push(m);
    }
    return { live, upcoming, finished };
  };

  const renderRefereeMatchItem = (m: NonNullable<typeof myTournamentData>['assigned_matches'] extends (infer U)[] | undefined ? U : never, showEdit = true) => {
    const homeTeam = teamName(m.home_team_id);
    const awayTeam = teamName(m.away_team_id);
    const isLive = m.status === 'LIVE' || m.status === 'live';
    const isFinished = m.status === 'FT' || m.status === 'finished';
    return (
      <TouchableOpacity
        key={m.id}
        style={[styles.refereeMatchCard, isLive && styles.refereeMatchCardLive]}
        onPress={() => {
          if (showEdit) {
            setShowRefereeModal(false);
            setEditMatch({ ...m, home_team_name: homeTeam, away_team_name: awayTeam } as any);
            setEditMode('score');
          }
        }}
        activeOpacity={0.8}
      >
        <View style={styles.refereeMatchStatus}>
          <View style={[styles.refereeStatusDot, isLive ? { backgroundColor: '#ef4444' } : isFinished ? { backgroundColor: '#22c55e' } : { backgroundColor: '#94a3b8' }]} />
          <Text style={[styles.refereeStatusText, isLive && { color: '#ef4444', fontWeight: '700' }]}>
            {isLive ? 'LIVE' : isFinished ? t('tournament.status.finished') : t('tournament.status.not_started')}
          </Text>
        </View>
        <View style={styles.refereeMatchTeams}>
          <Text style={styles.refereeMatchTeamName} numberOfLines={1}>{homeTeam || translateStageName(m.home_placeholder || '') || '---'}</Text>
          <View style={[styles.refereeScoreBadge, isLive && { borderColor: '#ef4444' }]}>
            <Text style={[styles.refereeScoreText, isLive && { color: '#ef4444' }]}>{fmtScore(m)}</Text>
          </View>
          <Text style={styles.refereeMatchTeamName} numberOfLines={1}>{awayTeam || translateStageName(m.away_placeholder || '') || '---'}</Text>
        </View>
        {m.scheduled_at && (
          <Text style={styles.refereeMatchTime}>{formatMatchDateTime(m.scheduled_at)}</Text>
        )}
        {m.venue && (
          <View style={styles.refereeMatchVenueRow}>
            <Ionicons name="location-outline" size={12} color={Colors.textTertiary} />
            <Text style={styles.refereeMatchVenue}>{m.venue}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderRefereeMatchSection = (title: string, icon: string, matches: any[], color: string) => {
    if (matches.length === 0) return null;
    return (
      <View style={{ marginBottom: Spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm }}>
          <Ionicons name={icon as any} size={16} color={color} />
          <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color }}>{title}</Text>
          <View style={{ backgroundColor: color + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color }}>{matches.length}</Text>
          </View>
        </View>
        {matches.map(m => renderRefereeMatchItem(m))}
      </View>
    );
  };

  const renderRefereeMatches = () => {
    const { live, upcoming, finished } = categorizeRefereeMatches();
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isRefereeUser ? '#dc2626' : Colors.primary} />}>
        {live.length === 0 && upcoming.length === 0 && finished.length === 0 ? (
          <View style={styles.mypageCard}>
            <Text style={styles.mypageEmpty}>{t('tournament.sections.no_assigned_matches')}</Text>
          </View>
        ) : (
          <>
            {renderRefereeMatchSection(t('tournament.status.live_badge'), 'radio-outline', live, '#ef4444')}
            {renderRefereeMatchSection(t('tournament.sections.upcoming'), 'time-outline', upcoming, '#2563eb')}
            {renderRefereeMatchSection(t('tournament.sections.finished'), 'checkmark-circle-outline', finished, '#22c55e')}
          </>
        )}
      </ScrollView>
    );
  };

  const TAB_ICONS: Record<Tab, string> = {
    my_matches: 'shield-checkmark-outline',
    matches: 'swap-horizontal-outline',
    standings: 'stats-chart-outline',
    overall: 'layers-outline',
    teams: 'people-outline',
    overview: 'information-circle-outline',
    mypage: 'person-circle-outline',
    chat: 'chatbubbles-outline',
  };

  const renderActiveTab = () => {
    switch (TABS[activeTabIndex]?.key) {
      case 'matches': return renderMatches();
      case 'standings': return renderStandings();
      case 'overall': return renderOverall();
      case 'teams': return renderTeams();
      case 'overview': return renderOverview();
      case 'mypage': return renderMyPage();
      case 'chat': return (
        <ChatTab
          tournamentId={tournament?.id}
          participantRole={chatParticipantRole}
          teamId={chatTeamId}
          teams={teams}
        />
      );
      default: return renderMatches();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="log-out-outline" size={22} color={Colors.text} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <View style={styles.headerCenter} pointerEvents="box-none">
          <TouchableOpacity onPress={() => setShowOverviewModal(true)} style={styles.headerTitleTouchable} activeOpacity={0.6}>
            <Text style={styles.headerTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>{(displayTournament ?? tournament).name}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowOverviewModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="information-circle-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {(() => {
          // チーム選択済みゲスト/キャプテン → チームアイコン → チーム詳細へ遷移
          const myTeamId = user?.teamId
            || (isUserAccount && myTournamentData?.team_id ? myTournamentData.team_id : null);
          const myTeam = myTeamId ? teams.find(t => t.id === myTeamId) : null;

          if (myTeam) {
            return (
              <TouchableOpacity style={styles.headerRight} onPress={() => router.push(`/tournament/${slug}/team/${myTeam.id}`)} activeOpacity={0.7}>
                {myTeam.logo_url ? (
                  <Image source={{ uri: myTeam.logo_url }} style={styles.headerTeamLogo} />
                ) : (
                  <View style={styles.headerTeamLogoPlaceholder}>
                    <Text style={styles.headerTeamLogoText}>{myTeam.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }

          // 審判 → 審判アイコン → タップで担当試合モーダル
          const isReferee = (isUserAccount && myTournamentData?.role === 'referee');
          if (isReferee) {
            return (
              <TouchableOpacity style={styles.headerRight} onPress={() => setShowRefereeModal(true)} activeOpacity={0.7}>
                <View style={styles.refereeIconBadge}>
                  <Ionicons name="shield-outline" size={20} color="#fff" />
                </View>
              </TouchableOpacity>
            );
          }

          // ホスト → 何も表示しない
          if (isHost) {
            return <View style={styles.headerRight} />;
          }

          // チーム未選択ゲスト → マイページアイコン
          return (
            <TouchableOpacity style={styles.headerRight} onPress={() => setShowMypageModal(true)} activeOpacity={0.7}>
              <Ionicons name="person-circle-outline" size={28} color={Colors.textTertiary} />
            </TouchableOpacity>
          );
        })()}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {renderActiveTab()}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.bottomTabBar}>
        {TABS.map((tab, index) => {
          const isActive = activeTabIndex === index;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.bottomTabItem}
              onPress={() => handleTabPress(index)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={TAB_ICONS[tab.key] as any}
                size={22}
                color={isActive ? Colors.primary : Colors.textTertiary}
              />
              <Text style={[styles.bottomTabLabel, isActive && styles.bottomTabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {editMatch && (
        <MatchEditModal visible={!!editMatch} onClose={() => setEditMatch(null)} match={editMatch} mode={editMode} onUpdated={fetchAll} referees={isHost ? referees.map(r => ({ user_id: r.user_id, display_name: r.display_name })) : undefined} isHost={isHost} onEditSchedule={() => { setEditMode('schedule'); }} />
      )}
      {/* Board team name popup */}
      <Modal visible={!!boardTeamPopup} transparent animationType="fade" onRequestClose={() => setBoardTeamPopup(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setBoardTeamPopup(null)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 28, paddingVertical: 22, marginHorizontal: 40, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'center' }}>{boardTeamPopup}</Text>
            <TouchableOpacity onPress={() => setBoardTeamPopup(null)} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 8, backgroundColor: Colors.surfaceSecondary, borderRadius: 99 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>{t('tournament.actions.close') ?? '閉じる'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {detailMatch && (
        <Modal visible={!!detailMatch} transparent animationType="fade" onRequestClose={() => setDetailMatch(null)}>
          <View style={styles.matchDetailBackdrop}>
            <TouchableOpacity style={styles.matchDetailBackdropTouch} activeOpacity={1} onPress={() => setDetailMatch(null)} />
            <View style={styles.matchDetailCard}>
              <View style={styles.matchDetailHeader}>
                <Text style={styles.matchDetailTitle}>{t('tournament.match_detail.title')}</Text>
                <TouchableOpacity onPress={() => setDetailMatch(null)} style={styles.matchDetailCloseBtn}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.matchDetailTeams}>
                {(detailMatch.home_team_name || detailMatch.home_placeholder || t('tournament.status.tbd'))} vs {(detailMatch.away_team_name || detailMatch.away_placeholder || t('tournament.status.tbd'))}
              </Text>
              <View style={styles.matchDetailRow}>
                <Text style={styles.matchDetailLabel}>{t('tournament.match_detail.time')}</Text>
                <Text style={styles.matchDetailValue}>{formatMatchDateTime(detailMatch.scheduled_at)}</Text>
              </View>
              <View style={styles.matchDetailRow}>
                <Text style={styles.matchDetailLabel}>{t('tournament.match_detail.location')}</Text>
                <Text style={styles.matchDetailValue}>{detailMatch.venue || tournament.venue || t('tournament.overview.not_set')}</Text>
              </View>
              <View style={styles.matchDetailRow}>
                <Text style={styles.matchDetailLabel}>{t('tournament.match_detail.status')}</Text>
                <Text style={styles.matchDetailValue}>{getMatchStatusLabel(detailMatch.status)}</Text>
              </View>
              {detailMatch.status === 'FT' && (
                <View style={styles.matchDetailRow}>
                  <Text style={styles.matchDetailLabel}>{t('tournament.match_detail.result')}</Text>
                  <Text style={styles.matchDetailValue}>
                    {detailMatch.home_score ?? 0} - {detailMatch.away_score ?? 0}
                    {detailMatch.home_pk_score != null && detailMatch.away_pk_score != null
                      ? ` (PK ${detailMatch.home_pk_score}-${detailMatch.away_pk_score})`
                      : ''}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
      {/* Overview Full Page Modal */}
      <Modal visible={showOverviewModal} animationType="slide" onRequestClose={() => setShowOverviewModal(false)}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowOverviewModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>{t('tournament.tabs.overview')}</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            {renderOverview()}
          </ScrollView>
        </View>
      </Modal>
      {/* Mypage Modal (チーム未選択ゲスト用) */}
      <Modal visible={showMypageModal} animationType="slide" onRequestClose={() => setShowMypageModal(false)}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowMypageModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>{t('tournament.sections.my_page_title')}</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            {renderMyPage()}
          </ScrollView>
        </View>
      </Modal>
      {/* Referee Match List Modal (header icon tap) */}
      <Modal visible={showRefereeModal} animationType="slide" onRequestClose={() => setShowRefereeModal(false)}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={[styles.modalHeader, { backgroundColor: '#dc2626' }]}>
            <TouchableOpacity style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={() => setShowRefereeModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: '#fff' }]} numberOfLines={1}>{t('tournament.sections.assigned_matches')}</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
            {(() => {
              const { live, upcoming, finished } = categorizeRefereeMatches();
              if (live.length === 0 && upcoming.length === 0 && finished.length === 0) {
                return (
                  <View style={styles.mypageCard}>
                    <Text style={styles.mypageEmpty}>{t('tournament.sections.no_assigned_matches')}</Text>
                  </View>
                );
              }
              return (
                <>
                  {renderRefereeMatchSection(t('tournament.status.live_badge'), 'radio-outline', live, '#ef4444')}
                  {renderRefereeMatchSection(t('tournament.sections.upcoming'), 'time-outline', upcoming, '#2563eb')}
                  {renderRefereeMatchSection(t('tournament.sections.finished'), 'checkmark-circle-outline', finished, '#22c55e')}
                </>
              );
            })()}
            <TouchableOpacity style={styles.leaveBtn} onPress={() => { setShowRefereeModal(false); handleLeave(); }}>
              <Ionicons name="exit-outline" size={16} color="#ef4444" />
              <Text style={styles.leaveBtnText}>{t('tournament.leave')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 48,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  headerCenter: {
    position: 'absolute',
    left: 52,
    right: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    pointerEvents: 'box-none',
  },
  headerTitleTouchable: { flexShrink: 1, alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    zIndex: 2,
  },
  headerTeamLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  // Modal header (no absolute positioning — simple flex row)
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 48,
    gap: Spacing.sm,
  },
  modalHeaderTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },

  headerTeamLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTeamLogoText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  // Bottom Tab Bar
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingBottom: 28,
    paddingTop: Spacing.md,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  bottomTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  bottomTabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // Sub Tab Bar (horizontal scroll)
  subTabBar: {
    backgroundColor: Colors.background,
    flexGrow: 0,
  },
  subTabBarContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  subTabItem: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  subTabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  subTabLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textTertiary,
  },
  subTabLabelActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  subTabPageTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },

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
  guestQrCard: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  guestQrInner: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guestQrHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 18,
  },
  guestQrUrl: {
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 4,
  },
  guestQrCopyBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
    width: '100%',
    alignItems: 'center',
  },
  guestQrCopyBtnText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
  },

  // Description
  descriptionCard: {
    backgroundColor: Colors.surfaceSecondary, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginHorizontal: Spacing.lg, gap: Spacing.sm,
  },
  descriptionText: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text, lineHeight: 24 },

  // Sections
  sectionBlock: { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  matchGroupBlock: { gap: 2 },
  matchGroupTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  stageName: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  roundSectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.xs },
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
  // TBD match card (either team not yet assigned)
  matchItemCardTBD: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    opacity: 0.65,
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
  roundDateText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  roundStatusBadge: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  placementStage: { padding: Spacing.lg, gap: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderLight },
  placementStageHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  placementStageName: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  roundBoardCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  roundBoardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  roundBoardTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  roundBoardDateBox: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg - 1,
  },
  roundBoardDateBoxText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#ffffff',
  },
  roundBoardRows: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  roundBoardGroup: {
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  roundBoardGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  roundBoardGroupLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  roundBoardGroupTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  roundBoardGroupTypeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roundBoardTeamGrid: {
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  roundBoardTeamLine: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  roundBoardTeamCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 4,
  },
  roundBoardTeamLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  roundBoardTeamLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBoardTeamLogoText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  roundBoardTeamName: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    width: '100%',
  },
  roundBoardBracketWrap: {
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    paddingVertical: Spacing.xs,
  },
  roundBoardChildLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  roundArrowContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  // Tournament rankings card
  rankingCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  rankingHeader: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankingHeaderText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#1e293b',
  },
  rankingTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rankingHeaderLabel: {
    fontWeight: '700',
    color: '#475569',
    fontSize: FontSize.xs,
  },
  rankingRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  rankingRowAlt: {
    backgroundColor: '#f8fafc',
  },
  rankingCell: {
    paddingHorizontal: Spacing.md,
  },
  rankingCellRank: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingCellTeam: {
    flex: 1,
    fontSize: FontSize.sm,
    color: '#0f172a',
  },
  rankingMedal: {
    fontSize: 18,
    textAlign: 'center',
  },
  rankingRankNum: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  rankingTeamBold: {
    fontWeight: '700',
  },
  bracketCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  childBracketColumn: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  childBracketCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  childBracketTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 2,
  },
  childBracketInner: {
    paddingBottom: Spacing.xs,
  },
  stageAccordionItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  stageAccordionItemChild: {
  },
  stageAccordionTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  stageAccordionTriggerChild: {
    paddingLeft: Spacing.xl,
    borderLeftWidth: 2,
    borderLeftColor: Colors.warning,
  },
  stageNameWrap: {
    flex: 1,
    gap: 2,
  },
  stageChildHint: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.warning,
  },
  stageChildBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.warningLight,
  },
  stageChildBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.warning,
  },
  stageAccordionContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
  },
  stageBracketGroup: {
    gap: Spacing.xs,
  },
  stageBracketWrap: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
  },
  placementGroups: { gap: Spacing.md },
  placementGroup: { gap: Spacing.xs },
  placementGroupTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.xs },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceSecondary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm, marginBottom: 2,
  },
  slotTeamLogo: { width: 28, height: 28, borderRadius: 6 },
  slotTeamLogoPlaceholder: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  slotTeamLogoText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  slotName: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  emptySlotText: { fontSize: FontSize.xs, color: Colors.textTertiary, fontStyle: 'italic' },

  // Team list items
  myTeamHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
  },
  myTeamHeroBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopRightRadius: BorderRadius.lg - 1,
    borderBottomLeftRadius: BorderRadius.md,
  },
  myTeamHeroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
  myTeamHeroLogo: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  myTeamHeroLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myTeamHeroLogoText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  myTeamHeroName: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  myTeamMatchSection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  myTeamMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.xs,
  },
  myTeamMatchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  myTeamMatchHeaderText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  myTeamMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  myTeamMatchScore: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    minWidth: 44,
    textAlign: 'center',
  },
  myTeamMatchOpLogo: {
    width: 20,
    height: 20,
    borderRadius: 5,
    marginHorizontal: Spacing.sm,
  },
  myTeamMatchOpLogoPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.sm,
  },
  myTeamMatchOpLogoText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  myTeamMatchTeam: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.text,
  },
  teamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  teamGridItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  teamGridLogo: { width: 48, height: 48, borderRadius: 12 },
  teamGridLogoPlaceholder: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  teamGridLogoText: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textSecondary },
  teamGridName: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    width: '100%',
  },

  // Match detail modal (guest)
  matchDetailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  matchDetailBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  matchDetailCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  matchDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchDetailTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  matchDetailCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceSecondary,
  },
  matchDetailTeams: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  matchDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 2,
  },
  matchDetailLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  matchDetailValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },

  mypageCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.md,
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  mypageCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  mypageMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  mypageMatchTeam: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  mypageScoreBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  mypageScoreText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  mypageMatchMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  mypageResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.1)',
  },
  mypageResultTeam: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.text,
  },
  mypageResultScore: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  mypageEnterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
  },
  mypageEnterBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
  mypageEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#fff5f5',
  },
  leaveBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: '#ef4444',
  },
  finishCard: {
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceSecondary,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  finishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  finishLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  finishHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  finishBtn: {
    backgroundColor: '#dc2626',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  finishBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  finishDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  finishDoneIcon: {
    fontSize: 18,
  },
  finishDoneText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  // ★ Referee styles
  refereeIconBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
  },
  refereeMatchCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.md,
  },
  refereeMatchCardLive: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
    backgroundColor: '#fef2f2',
  },
  refereeMatchStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 8,
    paddingLeft: Spacing.xs,
  },
  refereeStatusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  refereeStatusText: {
    fontSize: 12, fontWeight: '600', color: Colors.textSecondary,
  },
  refereeMatchTeams: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  refereeMatchTeamName: {
    flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.text, textAlign: 'center',
  },
  refereeScoreBadge: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 10, backgroundColor: 'transparent',
    borderWidth: 1, borderColor: Colors.border,
    minWidth: 72, alignItems: 'center',
  },
  refereeScoreText: {
    fontSize: 22, fontWeight: '800', color: Colors.text,
  },
  refereeMatchTime: {
    fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: 6,
  },
  refereeMatchVenueRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2,
  },
  refereeMatchVenue: {
    fontSize: 12, color: Colors.textTertiary,
  },
});
