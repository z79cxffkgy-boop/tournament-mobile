import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme';

interface BracketNode {
  id: string;
  round: number;
  position: number;
  team_a?: string | null;
  team_b?: string | null;
  score_a?: number | null;
  score_b?: number | null;
  winner?: string | null;
  match_id?: number | null;
}

interface Props {
  nodes: BracketNode[];
  totalRounds: number;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 52;
const ROUND_GAP = 40;
const MATCH_VERTICAL_GAP = 8;
const LINE_COLOR = '#94a3b8';
const WINNER_COLOR = '#4f46e5';
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function BracketView({ nodes, totalRounds }: Props) {
  const roundsMap = useMemo(() => {
    const map = new Map<number, BracketNode[]>();
    nodes.forEach((n) => {
      const arr = map.get(n.round) || [];
      arr.push(n);
      map.set(n.round, arr);
    });
    // Sort each round by position
    map.forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [nodes]);

  const roundLabel = (round: number, total: number) => {
    if (round === total) return '決勝';
    if (round === total - 1) return '準決勝';
    if (round === total - 2) return '準々決勝';
    return `R${round}`;
  };

  // Calculate positions for each match node
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; centerY: number }>();
    const columnWidth = NODE_WIDTH + ROUND_GAP;

    // Start from round 1 (leftmost)
    const round1Nodes = roundsMap.get(1) || [];
    const matchHeight = NODE_HEIGHT + MATCH_VERTICAL_GAP;

    // Position round 1
    round1Nodes.forEach((node, index) => {
      const x = 0;
      const y = index * matchHeight * 2;
      pos.set(node.id, { x, y, centerY: y + NODE_HEIGHT / 2 });
    });

    // Position subsequent rounds - centered between their children
    for (let r = 2; r <= totalRounds; r++) {
      const roundNodes = roundsMap.get(r) || [];
      const prevRoundNodes = roundsMap.get(r - 1) || [];
      const x = (r - 1) * columnWidth;

      roundNodes.forEach((node, index) => {
        // Each match in this round corresponds to 2 matches from prev round
        const childIndex1 = index * 2;
        const childIndex2 = index * 2 + 1;
        const child1 = prevRoundNodes[childIndex1];
        const child2 = prevRoundNodes[childIndex2];

        let y: number;
        if (child1 && child2) {
          const pos1 = pos.get(child1.id);
          const pos2 = pos.get(child2.id);
          if (pos1 && pos2) {
            y = (pos1.centerY + pos2.centerY) / 2 - NODE_HEIGHT / 2;
          } else {
            y = index * matchHeight * Math.pow(2, r);
          }
        } else if (child1) {
          const pos1 = pos.get(child1.id);
          y = pos1 ? pos1.y : index * matchHeight * Math.pow(2, r);
        } else {
          y = index * matchHeight * Math.pow(2, r);
        }

        pos.set(node.id, { x, y, centerY: y + NODE_HEIGHT / 2 });
      });
    }

    return pos;
  }, [roundsMap, totalRounds]);

  // Calculate total canvas size
  const canvasWidth = totalRounds * (NODE_WIDTH + ROUND_GAP) + 20;
  const allPositions = Array.from(positions.values());
  const canvasHeight = allPositions.length > 0
    ? Math.max(...allPositions.map((p) => p.y + NODE_HEIGHT)) + 40
    : 300;

  // Generate connecting lines
  const lines = useMemo(() => {
    const result: { x1: number; y1: number; x2: number; y2: number; midX: number; isWinner: boolean }[] = [];
    const columnWidth = NODE_WIDTH + ROUND_GAP;

    for (let r = 2; r <= totalRounds; r++) {
      const roundNodes = roundsMap.get(r) || [];
      const prevRoundNodes = roundsMap.get(r - 1) || [];

      roundNodes.forEach((node, index) => {
        const nodePos = positions.get(node.id);
        if (!nodePos) return;

        const childIndex1 = index * 2;
        const childIndex2 = index * 2 + 1;

        [childIndex1, childIndex2].forEach((ci) => {
          const child = prevRoundNodes[ci];
          if (!child) return;
          const childPos = positions.get(child.id);
          if (!childPos) return;

          const isWinner =
            node.winner &&
            ((ci === childIndex1 && node.team_a === node.winner) ||
              (ci === childIndex2 && node.team_b === node.winner));

          result.push({
            x1: childPos.x + NODE_WIDTH,
            y1: childPos.centerY,
            x2: nodePos.x,
            y2: nodePos.centerY,
            midX: childPos.x + NODE_WIDTH + ROUND_GAP / 2,
            isWinner: !!isWinner,
          });
        });
      });
    }
    return result;
  }, [roundsMap, positions, totalRounds]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.canvas, { width: canvasWidth, height: canvasHeight }]}>
          {/* Connecting lines */}
          {lines.map((line, i) => {
            const lineColor = line.isWinner ? WINNER_COLOR : LINE_COLOR;
            const midX = line.midX;

            return (
              <React.Fragment key={`line-${i}`}>
                {/* Horizontal from child to mid */}
                <View
                  style={{
                    position: 'absolute',
                    left: line.x1,
                    top: line.y1 - 1,
                    width: midX - line.x1,
                    height: 2.5,
                    backgroundColor: lineColor,
                  }}
                />
                {/* Vertical at mid */}
                <View
                  style={{
                    position: 'absolute',
                    left: midX - 1,
                    top: Math.min(line.y1, line.y2),
                    width: 2.5,
                    height: Math.abs(line.y2 - line.y1) + 2.5,
                    backgroundColor: lineColor,
                  }}
                />
                {/* Horizontal from mid to parent */}
                <View
                  style={{
                    position: 'absolute',
                    left: midX,
                    top: line.y2 - 1,
                    width: line.x2 - midX,
                    height: 2.5,
                    backgroundColor: lineColor,
                  }}
                />
              </React.Fragment>
            );
          })}

          {/* Round labels */}
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => (
            <View
              key={`label-${round}`}
              style={{
                position: 'absolute',
                left: (round - 1) * (NODE_WIDTH + ROUND_GAP),
                top: -28,
                width: NODE_WIDTH,
                alignItems: 'center',
              }}
            >
              <Text style={styles.roundLabel}>{roundLabel(round, totalRounds)}</Text>
            </View>
          ))}

          {/* Match nodes */}
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => {
            const roundNodes = roundsMap.get(round) || [];
            return roundNodes.map((node) => {
              const nodePos = positions.get(node.id);
              if (!nodePos) return null;
              const aWon = node.winner && node.winner === node.team_a;
              const bWon = node.winner && node.winner === node.team_b;

              return (
                <View
                  key={node.id}
                  style={[
                    styles.matchBox,
                    {
                      position: 'absolute',
                      left: nodePos.x,
                      top: nodePos.y,
                      width: NODE_WIDTH,
                    },
                  ]}
                >
                  {/* Team A */}
                  <View style={[styles.teamRow, aWon && styles.winnerRow]}>
                    <View style={styles.teamDot}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: aWon ? WINNER_COLOR : '#cbd5e1' },
                        ]}
                      />
                    </View>
                    <Text
                      style={[styles.teamText, aWon && styles.winnerText]}
                      numberOfLines={1}
                    >
                      {node.team_a || 'TBD'}
                    </Text>
                    <Text style={[styles.scoreText, aWon && styles.winnerScoreText]}>
                      {node.score_a ?? '—'}
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  {/* Team B */}
                  <View style={[styles.teamRow, bWon && styles.winnerRow]}>
                    <View style={styles.teamDot}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: bWon ? WINNER_COLOR : '#cbd5e1' },
                        ]}
                      />
                    </View>
                    <Text
                      style={[styles.teamText, bWon && styles.winnerText]}
                      numberOfLines={1}
                    >
                      {node.team_b || 'TBD'}
                    </Text>
                    <Text style={[styles.scoreText, bWon && styles.winnerScoreText]}>
                      {node.score_b ?? '—'}
                    </Text>
                  </View>
                </View>
              );
            });
          })}

          {/* Winner circle at the end */}
          {totalRounds > 0 && (() => {
            const finalNodes = roundsMap.get(totalRounds) || [];
            const finalNode = finalNodes[0];
            if (!finalNode) return null;
            const finalPos = positions.get(finalNode.id);
            if (!finalPos) return null;
            const champion = finalNode.winner;
            return (
              <View
                style={{
                  position: 'absolute',
                  left: finalPos.x + NODE_WIDTH + 16,
                  top: finalPos.centerY - 16,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: champion ? WINNER_COLOR : '#e2e8f0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {champion && (
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>W</Text>
                )}
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    paddingTop: 36,
    paddingLeft: 10,
    paddingBottom: 20,
    paddingRight: 50,
  },
  roundLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  matchBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  winnerRow: {
    backgroundColor: 'rgba(79,70,229,0.06)',
  },
  teamDot: {
    width: 14,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamText: {
    flex: 1,
    fontSize: 11,
    color: Colors.text,
    marginLeft: 4,
  },
  winnerText: {
    fontWeight: '700',
    color: WINNER_COLOR,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    minWidth: 18,
    textAlign: 'right',
  },
  winnerScoreText: {
    color: WINNER_COLOR,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
});
