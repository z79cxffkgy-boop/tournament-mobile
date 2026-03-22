import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme';
import { apiFetch } from '../api/client';
import { MatchData } from './MatchCard';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type EditMode = 'schedule' | 'score';

interface Props {
  visible: boolean;
  onClose: () => void;
  match: MatchData | null;
  mode: EditMode;
  onUpdated: () => void;
}

export default function MatchEditModal({
  visible,
  onClose,
  match,
  mode,
  onUpdated,
}: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [saving, setSaving] = useState(false);

  const isLive = match?.status === 'LIVE';
  const isFinished = match?.status === 'FT';

  useEffect(() => {
    if (match) {
      if (match.scheduled_at) {
        const d = new Date(match.scheduled_at);
        setDate(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        );
        setTime(
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        );
      } else {
        setDate('');
        setTime('');
      }
      setVenue(match.venue || '');
      setHomeScore(match.home_score?.toString() ?? '0');
      setAwayScore(match.away_score?.toString() ?? '0');
    }
  }, [match]);

  const handleSaveSchedule = async () => {
    if (!match) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (date && time) {
        payload.scheduled_at = new Date(`${date}T${time}:00`).toISOString();
      } else if (date) {
        payload.scheduled_at = new Date(`${date}T00:00:00`).toISOString();
      }
      if (venue !== undefined) payload.venue = venue;

      await apiFetch(`/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      Alert.alert('エラー', err.message || 'スケジュールの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleStartMatch = async () => {
    if (!match) return;
    setSaving(true);
    try {
      // Only send status — no score fields to avoid auto-FT logic
      await apiFetch(`/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'LIVE' }),
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      Alert.alert('エラー', err.message || '試合の開始に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveScore = async () => {
    if (!match) return;
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_)) {
      Alert.alert('入力エラー', 'スコアを正しく入力してください');
      return;
    }
    setSaving(true);
    try {
      // Save scores first (backend auto-sets FT when both scores are present)
      await apiFetch(`/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ home_score: hs, away_score: as_ }),
      });
      // Then reset status back to LIVE since match is still ongoing
      await apiFetch(`/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'LIVE' }),
      });
      onUpdated();
    } catch (err: any) {
      Alert.alert('エラー', err.message || 'スコアの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleEndMatch = async () => {
    if (!match) return;
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_)) {
      Alert.alert('入力エラー', 'スコアを正しく入力してください');
      return;
    }
    Alert.alert(
      '試合終了',
      'この試合を終了しますか？スコアが確定されます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '終了する',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await apiFetch(`/matches/${match.id}/score`, {
                method: 'POST',
                body: JSON.stringify({
                  home_score: hs,
                  away_score: as_,
                  status: 'FT',
                }),
              });
              onUpdated();
              onClose();
            } catch (err: any) {
              Alert.alert('エラー', err.message || '試合終了に失敗しました');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const homeName = match?.home_team_name || match?.home_placeholder || 'TBD';
  const awayName = match?.away_team_name || match?.away_placeholder || 'TBD';

  // Determine what UI to show based on match state + mode
  const showStartButton = mode === 'score' && !isLive && !isFinished;
  const showLiveScoring = mode === 'score' && isLive;
  const showScoreCorrection = mode === 'score' && isFinished;

  // Swipe-down-to-dismiss on handle
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          // Swiped far enough → dismiss
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Backdrop: tap outside sheet to close */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Swipeable handle */}
          <View {...panResponder.panHandlers}>
            <View style={styles.handleHitArea}>
              <View style={styles.handle} />
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {mode === 'schedule' ? (
              <>
                <Text style={styles.title}>スケジュール設定</Text>
                <Text style={styles.matchLabel}>
                  {homeName} vs {awayName}
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>日付</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textTertiary}
                    value={date}
                    onChangeText={setDate}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>時間</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="HH:MM"
                    placeholderTextColor={Colors.textTertiary}
                    value={time}
                    onChangeText={setTime}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>会場</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="会場名"
                    placeholderTextColor={Colors.textTertiary}
                    value={venue}
                    onChangeText={setVenue}
                  />
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelText}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSaveSchedule}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>
                      {saving ? '保存中...' : '保存'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : showStartButton ? (
              /* ===== START MATCH SCREEN ===== */
              <>
                <Text style={styles.title}>試合を開始</Text>
                <View style={styles.startMatchTeams}>
                  <Text style={styles.startMatchTeamName} numberOfLines={1}>{homeName}</Text>
                  <Text style={styles.startMatchVs}>vs</Text>
                  <Text style={styles.startMatchTeamName} numberOfLines={1}>{awayName}</Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.startMatchBtn}
                    onPress={handleStartMatch}
                    disabled={saving}
                  >
                    <Ionicons name="play-circle" size={22} color={Colors.textInverse} />
                    <Text style={styles.startMatchBtnText}>
                      {saving ? '開始中...' : '試合開始'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelText}>キャンセル</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (showLiveScoring || showScoreCorrection) ? (
              /* ===== LIVE SCORING / SCORE CORRECTION ===== */
              <>
                {showLiveScoring && (
                  <View style={styles.liveBadgeRow}>
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  </View>
                )}
                <Text style={styles.title}>
                  {showLiveScoring ? 'スコア編集' : 'スコア修正'}
                </Text>

                <View style={styles.scoreRow}>
                  <View style={styles.teamScoreCol}>
                    <Text style={styles.teamLabel} numberOfLines={1}>
                      {homeName}
                    </Text>
                    <TextInput
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      value={homeScore}
                      onChangeText={setHomeScore}
                      placeholder="0"
                      placeholderTextColor={Colors.textTertiary}
                      maxLength={3}
                    />
                  </View>

                  <Text style={styles.vs}>-</Text>

                  <View style={styles.teamScoreCol}>
                    <Text style={styles.teamLabel} numberOfLines={1}>
                      {awayName}
                    </Text>
                    <TextInput
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      value={awayScore}
                      onChangeText={setAwayScore}
                      placeholder="0"
                      placeholderTextColor={Colors.textTertiary}
                      maxLength={3}
                    />
                  </View>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={showLiveScoring ? handleSaveScore : handleSaveScore}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>
                      {saving ? '保存中...' : 'スコア保存'}
                    </Text>
                  </TouchableOpacity>
                  {showLiveScoring && (
                    <TouchableOpacity
                      style={styles.endMatchBtn}
                      onPress={handleEndMatch}
                      disabled={saving}
                    >
                      <Ionicons name="flag" size={18} color={Colors.textInverse} />
                      <Text style={styles.endMatchBtnText}>
                        {saving ? '処理中...' : '試合終了'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showScoreCorrection && (
                    <TouchableOpacity
                      style={[styles.saveBtn, styles.finishBtn]}
                      onPress={handleEndMatch}
                      disabled={saving}
                    >
                      <Text style={styles.saveBtnText}>
                        {saving ? '処理中...' : '試合終了 (FT)'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelText}>閉じる</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    paddingTop: 0,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  handleHitArea: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  matchLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Start match screen
  startMatchTeams: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
    paddingVertical: Spacing.lg,
  },
  startMatchTeamName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  startMatchVs: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  startMatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  startMatchBtnText: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textInverse,
  },

  // Live badge
  liveBadgeRow: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textInverse,
  },
  liveBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textInverse,
    letterSpacing: 1,
  },

  // Score editing
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  teamScoreCol: {
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  teamLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  scoreInput: {
    width: 80,
    height: 60,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    fontSize: FontSize.xxxl,
    fontWeight: '700',
    textAlign: 'center',
    color: Colors.text,
    backgroundColor: Colors.surfaceSecondary,
  },
  vs: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 28,
  },

  // End match
  endMatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  endMatchBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textInverse,
  },

  actions: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelBtn: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  finishBtn: {
    backgroundColor: Colors.success,
  },
  saveBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textInverse,
  },
});
