import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme';

/* ── Types (matching Web TreeDiagramViewer) ── */

interface TreeNode {
  id: string;
  label: string;
  x: number;
  y: number;
  isInitial: boolean;
  type: 'root' | 'combined' | 'pass';
  parentA?: string;
  parentB?: string;
  parentId?: string;
}

interface TreeSnapshot {
  nodes: TreeNode[];
  active_ids?: string[];
  node_count?: number;
}

export interface TreeMatchItem {
  scheduled_at?: string | null;
  venue?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_pk_score?: number | null;
  away_pk_score?: number | null;
  home_placeholder?: string | null;
  away_placeholder?: string | null;
  round_index?: number | null;
  label?: string | null;
  id?: number;
}

interface TeamInfo {
  id: number;
  name: string;
  logo_url?: string | null;
}

interface SlotInfo {
  id: number;
  team_id?: number | null;
  order_index: number;
  placeholder_label?: string | null;
}

interface Props {
  snapshot: TreeSnapshot | null | undefined;
  matches?: TreeMatchItem[] | null;
  canEdit?: boolean;
  mode?: 'schedule' | 'result';
  onMatchUpdate?: (matchId: number, payload: Partial<TreeMatchItem>) => void;
  teams?: TeamInfo[];
  teamNameOverrides?: Record<string, string>;
  slots?: SlotInfo[];
  /** When true, initial nodes always show slot/placeholder names regardless of match results */
  fixedPlaceholders?: boolean;
}

/* ── Layout constants (mobile-optimized) ── */

const STEP_WIDTH = 200;
const STEP_HEIGHT = 48;
const OFFSET_X = 12;
const OFFSET_Y = 40;
const INITIAL_NODE_WIDTH = 120;
const INITIAL_NODE_MIN_HEIGHT = 32;
const STROKE_WIDTH = 2.5;
const STROKE_WIDTH_DASH = 1.5;
const BASE_LINE_COLOR = '#94a3b8';
const WIN_LINE_COLOR = '#4f46e5';
const BASE_DOT_COLOR = '#cbd5e1';
const WIN_DOT_COLOR = '#4f46e5';

/* ── Helper functions (same logic as Web) ── */

function resolveWinnerSide(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  homePkScore: number | null | undefined,
  awayPkScore: number | null | undefined,
): 'home' | 'away' | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  if (homePkScore == null || awayPkScore == null) return null;
  if (homePkScore > awayPkScore) return 'home';
  if (awayPkScore > homePkScore) return 'away';
  return null;
}

function isKnownName(value: string | undefined): boolean {
  const v = (value || '').trim();
  return v !== '' && v !== '未定';
}

/* ── Component ── */

export default function MobileBracketViewer({
  snapshot,
  matches,
  mode = 'result',
  teams = [],
  teamNameOverrides = {},
  slots,
  fixedPlaceholders = false,
}: Props) {
  if (!snapshot?.nodes?.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>構成データが未設定です</Text>
        <Text style={styles.emptySubtext}>管理画面で構成を作成してください</Text>
      </View>
    );
  }

  const nodes = snapshot.nodes;
  const activeIds = new Set(snapshot.active_ids ?? []);
  const nodeCount = snapshot.node_count ?? 8;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ── Slot-based name resolution ──
  const slotNameByNodeId = new Map<string, string>();
  if (slots && slots.length > 0) {
    const slotInitialNodes = nodes.filter((n) => n.isInitial).sort((a, b) => a.y - b.y);
    const sortedSlots = [...slots].sort((a, b) => a.order_index - b.order_index);
    slotInitialNodes.forEach((node, idx) => {
      const slot = sortedSlots[idx];
      if (!slot) return;
      if (slot.team_id) {
        const team = teams.find((t) => t.id === slot.team_id);
        if (team) slotNameByNodeId.set(node.id, team.name);
      } else if (slot.placeholder_label) {
        slotNameByNodeId.set(node.id, slot.placeholder_label);
      }
    });
  }

  // ── Label resolution (same as Web) ──
  const resolveLabel = (rawLabel: string | undefined, nodeId?: string): string => {
    if (nodeId && slotNameByNodeId.has(nodeId)) return slotNameByNodeId.get(nodeId)!;
    if (rawLabel && teamNameOverrides[rawLabel]) return teamNameOverrides[rawLabel];
    return rawLabel || '未定';
  };

  // ── Layout ──
  const effectiveStepHeight = Math.max(STEP_HEIGHT, INITIAL_NODE_MIN_HEIGHT + 8);
  const INITIAL_NODE_CENTER_Y = effectiveStepHeight / 2;
  const treeVisualHeight = nodeCount * effectiveStepHeight + OFFSET_Y * 2;
  const canvasHeight = Math.max(400, treeVisualHeight);
  const centeredOffsetY = OFFSET_Y + Math.max(0, (canvasHeight - treeVisualHeight) / 2);
  const maxX = Math.max(...nodes.map((n) => n.x), 1);
  const canvasWidth = maxX * STEP_WIDTH + OFFSET_X + INITIAL_NODE_WIDTH + 60;

  // ── Combined nodes & match mapping ──
  const combinedNodes = nodes
    .filter((n) => n.type === 'combined')
    .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  const sortedMatches = (matches ?? [])
    .slice()
    .sort((a, b) => (a.round_index ?? 0) - (b.round_index ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  const matchByNodeId = new Map(combinedNodes.map((n, idx) => [n.id, sortedMatches[idx] ?? null]));

  // ── Winner path tracing ──
  const selectedWinnerParentByNodeId = new Map<string, string>();
  const winnerEdgeKeys = new Set<string>();
  const winnerIncomingNodeIds = new Set<string>();

  if (mode !== 'schedule' && !fixedPlaceholders) {
    combinedNodes.forEach((node, idx) => {
      const match = sortedMatches[idx] ?? null;
      const winnerSide = resolveWinnerSide(match?.home_score, match?.away_score, match?.home_pk_score, match?.away_pk_score);
      if (!winnerSide) return;
      const winnerParentId = winnerSide === 'home' ? node.parentA : node.parentB;
      if (winnerParentId) selectedWinnerParentByNodeId.set(node.id, winnerParentId);
    });

    const traceBack = (nodeId: string, parentId: string) => {
      winnerEdgeKeys.add(`${parentId}->${nodeId}`);
      const parentNode = nodeById.get(parentId);
      if (parentNode?.type === 'pass' && parentNode.parentId) {
        winnerIncomingNodeIds.add(parentNode.id);
        traceBack(parentNode.id, parentNode.parentId);
      }
    };
    selectedWinnerParentByNodeId.forEach((winnerParentId, combinedNodeId) => {
      winnerIncomingNodeIds.add(combinedNodeId);
      traceBack(combinedNodeId, winnerParentId);
    });
  }

  // ── Provisional team name (same as Web) ──
  const provisionalTeamNameOfNode = (nodeId?: string): string => {
    if (!nodeId) return '未定';
    const n = nodeById.get(nodeId);
    if (!n) return '未定';
    if (n.isInitial) {
      const resolved = resolveLabel(n.label, n.id);
      return isKnownName(resolved) ? resolved : '未定';
    }
    if (n.type === 'pass') return provisionalTeamNameOfNode(n.parentId);
    if (n.type === 'combined') {
      if (mode !== 'schedule' && !fixedPlaceholders) {
        const winnerParentId = selectedWinnerParentByNodeId.get(n.id);
        if (winnerParentId) return provisionalTeamNameOfNode(winnerParentId);
      }
      const m = matchByNodeId.get(n.id) ?? null;
      if (isKnownName(m?.home_placeholder ?? undefined) && !isKnownName(m?.away_placeholder ?? undefined))
        return String(m?.home_placeholder);
      if (isKnownName(m?.away_placeholder ?? undefined) && !isKnownName(m?.home_placeholder ?? undefined))
        return String(m?.away_placeholder);
      return '未定';
    }
    return '未定';
  };

  // ── SVG edge paths ──
  const edgePaths = useMemo(() => {
    const result: { key: string; d: string; dashed: boolean }[] = [];
    nodes.forEach((node) => {
      if (node.type === 'combined') {
        const pA = node.parentA ? nodeById.get(node.parentA) : undefined;
        const pB = node.parentB ? nodeById.get(node.parentB) : undefined;
        if (!pA || !pB) return;
        const sxA = pA.x * STEP_WIDTH + OFFSET_X + (pA.isInitial ? INITIAL_NODE_WIDTH : 0);
        const syA = pA.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;
        const sxB = pB.x * STEP_WIDTH + OFFSET_X + (pB.isInitial ? INITIAL_NODE_WIDTH : 0);
        const syB = pB.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;
        const ex = node.x * STEP_WIDTH + OFFSET_X;
        const ey = node.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;
        const midA = sxA + (sxA + (ex - sxA) / 2 - sxA) / 2;
        const midB = sxB + (sxB + (ex - sxB) / 2 - sxB) / 2;
        if (node.parentA) {
          result.push({
            key: `${node.parentA}->${node.id}`,
            d: `M ${sxA} ${syA} L ${midA} ${syA} L ${midA} ${ey} L ${ex} ${ey}`,
            dashed: false,
          });
        }
        if (node.parentB) {
          result.push({
            key: `${node.parentB}->${node.id}`,
            d: `M ${sxB} ${syB} L ${midB} ${syB} L ${midB} ${ey} L ${ex} ${ey}`,
            dashed: false,
          });
        }
      } else if (node.type === 'pass' && node.parentId) {
        const p = nodeById.get(node.parentId);
        if (!p) return;
        const sx = p.x * STEP_WIDTH + OFFSET_X + (p.isInitial ? INITIAL_NODE_WIDTH : 0);
        const sy = p.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;
        const ex = node.x * STEP_WIDTH + OFFSET_X;
        const ey = node.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;
        result.push({
          key: `${node.parentId}->${node.id}`,
          d: `M ${sx} ${sy} L ${ex} ${ey}`,
          dashed: true,
        });
      }
    });
    return result;
  }, [nodes, effectiveStepHeight, centeredOffsetY]);

  // ── Score label positions for combined nodes ──
  // Show scores near the branch point where lines meet, above/below the junction
  const scoreLabels = useMemo(() => {
    if (mode === 'schedule' || fixedPlaceholders) return [];
    const labels: { nodeId: string; homeScore: string; awayScore: string; x: number; yHome: number; yAway: number; isWinnerHome: boolean; isWinnerAway: boolean }[] = [];
    combinedNodes.forEach((node, idx) => {
      const match = sortedMatches[idx] ?? null;
      if (!match) return;
      if (match.home_score == null && match.away_score == null) return;

      const pA = node.parentA ? nodeById.get(node.parentA) : undefined;
      const pB = node.parentB ? nodeById.get(node.parentB) : undefined;
      if (!pA || !pB) return;

      // The junction point is at the combined node position
      const ex = node.x * STEP_WIDTH + OFFSET_X;
      const ey = node.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;
      const syA = pA.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;
      const syB = pB.y * effectiveStepHeight + centeredOffsetY + INITIAL_NODE_CENTER_Y;

      const winnerSide = resolveWinnerSide(match.home_score, match.away_score, match.home_pk_score, match.away_pk_score);

      // Home (parentA) score goes on the upper line, away (parentB) on the lower line
      // Position scores near the vertical segment of the L-shaped path, close to junction
      const sxA = pA.x * STEP_WIDTH + OFFSET_X + (pA.isInitial ? INITIAL_NODE_WIDTH : 0);
      const midA = sxA + (sxA + (ex - sxA) / 2 - sxA) / 2;

      // Score labels positioned on the vertical part of lines, near the junction point
      const scoreX = midA + 6; // Just to the right of the vertical line segment
      // Home score: on the line coming from above (between syA vertical bend and ey)
      const homeY = syA < ey ? ey - 14 : ey + 4;
      // Away score: on the line coming from below (between syB vertical bend and ey)
      const awayY = syB > ey ? ey + 4 : ey - 14;

      labels.push({
        nodeId: node.id,
        homeScore: match.home_score != null ? String(match.home_score) : '',
        awayScore: match.away_score != null ? String(match.away_score) : '',
        x: scoreX,
        yHome: homeY,
        yAway: awayY,
        isWinnerHome: winnerSide === 'home',
        isWinnerAway: winnerSide === 'away',
      });
    });
    return labels;
  }, [combinedNodes, sortedMatches, mode, effectiveStepHeight, centeredOffsetY]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.canvas, { width: canvasWidth, height: canvasHeight }]}>
          {/* SVG lines */}
          <Svg
            width={canvasWidth}
            height={canvasHeight}
            style={StyleSheet.absoluteFill}
          >
            {/* Base lines */}
            {edgePaths.map((edge) => (
              <Path
                key={`base-${edge.key}`}
                d={edge.d}
                fill="none"
                stroke={BASE_LINE_COLOR}
                strokeWidth={edge.dashed ? STROKE_WIDTH_DASH : STROKE_WIDTH_DASH + 0.6}
                strokeDasharray={edge.dashed ? '4 2' : undefined}
                strokeLinecap="round"
              />
            ))}
            {/* Winner lines (on top) */}
            {edgePaths
              .filter((edge) => winnerEdgeKeys.has(edge.key))
              .map((edge) => (
                <Path
                  key={`win-${edge.key}`}
                  d={edge.d}
                  fill="none"
                  stroke={WIN_LINE_COLOR}
                  strokeWidth={STROKE_WIDTH + 0.5}
                  strokeLinecap="round"
                />
              ))}
          </Svg>

          {/* Initial nodes (team cards) */}
          {nodes.map((node) => {
            if (!node.isInitial && !activeIds.has(node.id)) return null;

            const left = node.x * STEP_WIDTH + OFFSET_X;
            const top = node.y * effectiveStepHeight + centeredOffsetY;
            const label = resolveLabel(node.label, node.id);

            if (node.isInitial) {
              return (
                <View
                  key={node.id}
                  style={[
                    styles.initialNode,
                    {
                      position: 'absolute',
                      left,
                      top,
                      width: INITIAL_NODE_WIDTH,
                      minHeight: INITIAL_NODE_MIN_HEIGHT,
                    },
                  ]}
                >
                  <View style={styles.initialNodeIcon}>
                    <Text style={styles.initialNodeIconText}>
                      {label.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.initialNodeLabel} numberOfLines={2}>
                    {label}
                  </Text>
                </View>
              );
            }

            // Pass/combined dot
            const isWinner = winnerIncomingNodeIds.has(node.id);
            return (
              <View
                key={node.id}
                style={{
                  position: 'absolute',
                  left: left - 8,
                  top: top + INITIAL_NODE_CENTER_Y - 8,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: isWinner ? WIN_DOT_COLOR : BASE_DOT_COLOR,
                  borderWidth: 1.5,
                  borderColor: isWinner ? WIN_DOT_COLOR : '#cbd5e1',
                  zIndex: 20,
                }}
              />
            );
          })}

          {/* Score labels on lines near junction */}
          {scoreLabels.map((sl) => (
            <React.Fragment key={`scores-${sl.nodeId}`}>
              {sl.homeScore !== '' && (
                <View
                  style={[
                    styles.scoreLabel,
                    {
                      position: 'absolute',
                      left: sl.x,
                      top: sl.yHome,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scoreLabelText,
                      sl.isWinnerHome && styles.scoreLabelWinner,
                    ]}
                  >
                    {sl.homeScore}
                  </Text>
                </View>
              )}
              {sl.awayScore !== '' && (
                <View
                  style={[
                    styles.scoreLabel,
                    {
                      position: 'absolute',
                      left: sl.x,
                      top: sl.yAway,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scoreLabelText,
                      sl.isWinnerAway && styles.scoreLabelWinner,
                    ]}
                  >
                    {sl.awayScore}
                  </Text>
                </View>
              )}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    paddingTop: 10,
    paddingLeft: 4,
    paddingBottom: 20,
    paddingRight: 40,
  },
  emptyContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },

  // Initial nodes (team cards)
  initialNode: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 20,
  },
  initialNodeIcon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialNodeIconText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  initialNodeLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 13,
  },

  // Score labels on lines
  scoreLabel: {
    zIndex: 25,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  scoreLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  scoreLabelWinner: {
    color: WIN_LINE_COLOR,
  },
});
