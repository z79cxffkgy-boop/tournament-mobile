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
  Image,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme';
import { apiFetch } from '../api/client';
import { MatchData } from './MatchCard';
import { useTranslation } from '../hooks/useTranslation';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type EditMode = 'schedule' | 'score';

interface RefereeInfo {
  user_id: number;
  display_name: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  match: MatchData | null;
  mode: EditMode;
  onUpdated: () => void;
  referees?: RefereeInfo[];
  isHost?: boolean;
  onEditSchedule?: () => void;
}

export default function MatchEditModal({
  visible,
  onClose,
  match,
  mode,
  onUpdated,
  referees,
  isHost = false,
  onEditSchedule,
}: Props) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedRefereeId, setSelectedRefereeId] = useState<number | null | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  // 審判が「試合開始」を押した後のローカル状態
  const [localLive, setLocalLive] = useState(false);
  // スコア保存が一度でも押されたか
  const [scoreSaved, setScoreSaved] = useState(false);

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
        setPickerDate(d);
      } else {
        setDate('');
        setTime('');
        setPickerDate(new Date());
      }
      setVenue(match.venue || '');
      setSelectedRefereeId(match.referee_id ?? null);
      setHomeScore(match.home_score != null ? match.home_score.toString() : '');
      setAwayScore(match.away_score != null ? match.away_score.toString() : '');
      // モーダルが新しい試合用に開かれる度にリセット
      setLocalLive(false);
      setScoreSaved(false);
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
      if (selectedRefereeId !== undefined) payload.referee_id = selectedRefereeId;

      await apiFetch(`/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      Alert.alert(t('match_modal.error_title'), err.message || t('match_modal.error_schedule'));
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
      // モーダルを閉じずフルスクリーンのスコア入力画面へ遷移
      setLocalLive(true);
      setScoreSaved(false);
    } catch (err: any) {
      Alert.alert(t('match_modal.error_title'), err.message || t('match_modal.error_start'));
    } finally {
      setSaving(false);
    }
  };

  // ライブ中に閉じようとした時の確認ダイアログ
  const handleCloseWithConfirm = () => {
    const isCurrentlyLive = localLive || isLive;
    if (isCurrentlyLive && !isFinished) {
      Alert.alert(
        '確認',
        '試合を終了していません。よろしいですか？',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: 'はい',
            onPress: () => {
              setLocalLive(false);
              setScoreSaved(false);
              onClose();
            },
          },
        ],
      );
    } else {
      onClose();
    }
  };

  const handleSaveScore = async () => {
    if (!match) return;
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_)) {
      Alert.alert(t('match_modal.input_error_title'), t('match_modal.input_error_score'));
      return;
    }
    setSaving(true);
    try {
      if (isFinished) {
        // 試合終了済み: スコアのみ修正（ステータスはFTのまま）
        await apiFetch(`/matches/${match.id}/score`, {
          method: 'POST',
          body: JSON.stringify({ home_score: hs, away_score: as_, status: 'FT' }),
        });
        onUpdated();
        onClose();
      } else {
        // ライブ中: スコア保存後、LIVEに戻す
        await apiFetch(`/matches/${match.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ home_score: hs, away_score: as_ }),
        });
        await apiFetch(`/matches/${match.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'LIVE' }),
        });
        onUpdated();
        setScoreSaved(true);
      }
    } catch (err: any) {
      Alert.alert(t('match_modal.error_title'), err.message || t('match_modal.error_score'));
    } finally {
      setSaving(false);
    }
  };

  const handleEndMatch = async () => {
    if (!match) return;
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_)) {
      Alert.alert(t('match_modal.input_error_title'), t('match_modal.input_error_score'));
      return;
    }
    Alert.alert(
      t('match_modal.finish_confirm_title'),
      t('match_modal.finish_confirm_msg'),
      [
        { text: t('match_modal.cancel'), style: 'cancel' },
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
              Alert.alert(t('match_modal.error_title'), err.message || t('match_modal.error_finish'));
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
  // ホストはスタートボタンをスキップして直接スコア入力へ。審判はスタートボタンを表示
  const showStartButton = mode === 'score' && !localLive && !isLive && !isFinished && !isHost;
  // localLive: 審判がこのセッションで試合開始した場合。isLive: すでにLIVE。ホストのNS試合も含む
  const showLiveScoring = mode === 'score' && (localLive || isLive || (isHost && !isLive && !isFinished));
  const showScoreCorrection = mode === 'score' && isFinished;
  // 試合終了後はホストのみ編集可能
  const canEditFinishedScore = isFinished && isHost;
  // 試合開始後はフルスクリーン
  const isFullScreen = localLive;

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
          // Swiped far enough → dismiss (確認ダイアログを経由)
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          handleCloseWithConfirm();
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
        {/* Backdrop: フルスクリーン時はタップ無効、通常時は閉じる確認 */}
        <TouchableWithoutFeedback onPress={isFullScreen ? undefined : handleCloseWithConfirm}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, isFullScreen && styles.sheetFullScreen, { transform: [{ translateY }] }]}>
          {/* Swipeable handle */}
          <View {...panResponder.panHandlers}>
            <View style={styles.handleHitArea}>
              <View style={styles.handle} />
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {mode === 'schedule' ? (
              <>
                <Text style={styles.title}>{t('match_modal.schedule_title')}</Text>
                <Text style={styles.matchLabel}>
                  {homeName} vs {awayName}
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t('match_modal.date_label')}</Text>
                  <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                    <Text style={[styles.pickerBtnText, !date && { color: Colors.textTertiary }]}>
                      {date || t('match_modal.date_placeholder')}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={pickerDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      locale="ja"
                      onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (selectedDate) {
                          setPickerDate(selectedDate);
                          setDate(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`);
                        }
                      }}
                    />
                  )}
                  {showDatePicker && Platform.OS === 'ios' && (
                    <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.pickerDoneBtnText}>完了</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t('match_modal.time_label')}</Text>
                  <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
                    <Ionicons name="time-outline" size={18} color={Colors.primary} />
                    <Text style={[styles.pickerBtnText, !time && { color: Colors.textTertiary }]}>
                      {time || '時間を選択'}
                    </Text>
                  </TouchableOpacity>
                  {showTimePicker && (
                    <DateTimePicker
                      value={pickerDate}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      locale="ja"
                      is24Hour={true}
                      onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                        setShowTimePicker(Platform.OS === 'ios');
                        if (selectedDate) {
                          setPickerDate(selectedDate);
                          setTime(`${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`);
                        }
                      }}
                    />
                  )}
                  {showTimePicker && Platform.OS === 'ios' && (
                    <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowTimePicker(false)}>
                      <Text style={styles.pickerDoneBtnText}>完了</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t('match_modal.venue_label')}</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder={t("match_modal.venue_placeholder")}
                    placeholderTextColor={Colors.textTertiary}
                    value={venue}
                    onChangeText={setVenue}
                  />
                </View>

                {referees && referees.length > 0 && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>審判</Text>
                    {[{ user_id: null as number | null, display_name: '未割り当て' }, ...referees].map((ref) => (
                      <TouchableOpacity
                        key={ref.user_id ?? 'none'}
                        style={[
                          styles.refereeOption,
                          selectedRefereeId === ref.user_id && styles.refereeOptionSelected,
                        ]}
                        onPress={() => setSelectedRefereeId(ref.user_id)}
                      >
                        <Text style={[
                          styles.refereeOptionText,
                          selectedRefereeId === ref.user_id && styles.refereeOptionTextSelected,
                        ]}>
                          {ref.display_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelText}>{t('match_modal.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSaveSchedule}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>
                      {saving ? t('match_modal.saving') : t('match_modal.save')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : showStartButton ? (
              /* ===== START MATCH SCREEN (審判のみ) ===== */
              <>
                <Text style={styles.title}>{t('match_modal.start_match')}</Text>
                <View style={styles.startMatchTeams}>
                  <View style={styles.startTeamWithIcon}>
                    {match?.home_team_logo ? (
                      <Image source={{ uri: match.home_team_logo }} style={styles.startMatchTeamIcon} />
                    ) : (
                      <View style={styles.startMatchTeamIconPlaceholder}>
                        <Text style={styles.startMatchTeamIconText}>{homeName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.startMatchTeamName} numberOfLines={1}>{homeName}</Text>
                  </View>
                  <Text style={styles.startMatchVs}>vs</Text>
                  <View style={styles.startTeamWithIcon}>
                    {match?.away_team_logo ? (
                      <Image source={{ uri: match.away_team_logo }} style={styles.startMatchTeamIcon} />
                    ) : (
                      <View style={styles.startMatchTeamIconPlaceholder}>
                        <Text style={styles.startMatchTeamIconText}>{awayName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.startMatchTeamName} numberOfLines={1}>{awayName}</Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.startMatchBtn}
                    onPress={handleStartMatch}
                    disabled={saving}
                  >
                    <Ionicons name="play-circle" size={22} color={Colors.textInverse} />
                    <Text style={styles.startMatchBtnText}>
                      {saving ? t('match_modal.starting') : t('match_modal.start_match')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={handleCloseWithConfirm}>
                    <Text style={styles.cancelText}>{t('match_modal.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (showLiveScoring || showScoreCorrection) ? (
              /* ===== LIVE SCORING / SCORE CORRECTION ===== */
              <>
                {/* LIVEバッジは実際にLIVE中のみ表示 */}
                {showLiveScoring && isLive && (
                  <View style={styles.liveBadgeRow}>
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  </View>
                )}
                {showScoreCorrection && (
                  <View style={styles.liveBadgeRow}>
                    <View style={[styles.liveBadge, { backgroundColor: '#22c55e' }]}>
                      <Ionicons name="checkmark-circle" size={12} color="#fff" />
                      <Text style={styles.liveBadgeText}>{t('match_modal.live_badge')}</Text>
                    </View>
                  </View>
                )}
                <Text style={styles.title}>
                  {showLiveScoring
                    ? (isLive ? t('match_modal.score_edit_mode') : t('match_modal.score_title'))
                    : (canEditFinishedScore ? t('match_modal.score_fix_mode') : t('match_modal.result_title'))}
                </Text>

                <View style={styles.scoreRow}>
                  <View style={styles.teamScoreCol}>
                    {/* チームアイコン */}
                    {match?.home_team_logo ? (
                      <Image source={{ uri: match.home_team_logo }} style={styles.modalTeamLogo} />
                    ) : (
                      <View style={styles.modalTeamLogoPlaceholder}>
                        <Text style={styles.modalTeamLogoText}>{homeName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.teamLabel} numberOfLines={1}>
                      {homeName}
                    </Text>
                    <TextInput
                      style={[styles.scoreInput, (showScoreCorrection && !canEditFinishedScore) && styles.scoreInputDisabled]}
                      keyboardType="number-pad"
                      value={homeScore}
                      onChangeText={setHomeScore}
                      placeholder="0"
                      placeholderTextColor={Colors.textTertiary}
                      maxLength={3}
                      editable={showLiveScoring || canEditFinishedScore}
                    />
                  </View>

                  <Text style={styles.vs}>-</Text>

                  <View style={styles.teamScoreCol}>
                    {/* チームアイコン */}
                    {match?.away_team_logo ? (
                      <Image source={{ uri: match.away_team_logo }} style={styles.modalTeamLogo} />
                    ) : (
                      <View style={styles.modalTeamLogoPlaceholder}>
                        <Text style={styles.modalTeamLogoText}>{awayName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.teamLabel} numberOfLines={1}>
                      {awayName}
                    </Text>
                    <TextInput
                      style={[styles.scoreInput, (showScoreCorrection && !canEditFinishedScore) && styles.scoreInputDisabled]}
                      keyboardType="number-pad"
                      value={awayScore}
                      onChangeText={setAwayScore}
                      placeholder="0"
                      placeholderTextColor={Colors.textTertiary}
                      maxLength={3}
                      editable={showLiveScoring || canEditFinishedScore}
                    />
                  </View>
                </View>

                {showScoreCorrection && !canEditFinishedScore && (
                  <Text style={styles.readOnlyHint}>{t('match_modal.host_only_hint')}</Text>
                )}

                <View style={styles.actions}>
                  {/* スコア保存ボタン: LIVE中またはホストのFT修正時のみ表示 */}
                  {((showLiveScoring && isLive) || canEditFinishedScore) && (
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={handleSaveScore}
                      disabled={saving}
                    >
                      <Text style={styles.saveBtnText}>
                        {saving ? t('match_modal.saving') : t('match_modal.save_score')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showLiveScoring && (
                    <TouchableOpacity
                      style={[styles.endMatchBtn, (!scoreSaved) && styles.endMatchBtnDisabled]}
                      onPress={handleEndMatch}
                      disabled={saving || !scoreSaved}
                    >
                      <Ionicons name="flag" size={18} color={Colors.textInverse} />
                      <Text style={styles.endMatchBtnText}>
                        {saving ? t('match_modal.processing') : t('match_modal.finish_match_short')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showLiveScoring && !scoreSaved && (
                    <Text style={styles.saveScoreHint}>スコアを保存してから試合を終了してください</Text>
                  )}
                  <TouchableOpacity style={styles.cancelBtn} onPress={handleCloseWithConfirm}>
                    <Text style={styles.cancelText}>{t('match_modal.close')}</Text>
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
  sheetFullScreen: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    maxHeight: '100%',
    paddingTop: 60,
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

  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerBtnText: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  pickerDoneBtn: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  pickerDoneBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },

  refereeOption: {
    backgroundColor: Colors.surfaceSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.xs,
  },
  refereeOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(37,99,235,0.06)',
  },
  refereeOptionText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  refereeOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // Start match screen
  startMatchTeams: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
    paddingVertical: Spacing.lg,
  },
  startTeamWithIcon: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  startMatchTeamIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  startMatchTeamIconPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startMatchTeamIconText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textSecondary,
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
  scoreInputDisabled: {
    backgroundColor: Colors.background,
    borderColor: Colors.borderLight,
    color: Colors.textSecondary,
  },
  // チームアイコン（スコア入力モーダル内）
  modalTeamLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalTeamLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modalTeamLogoText: {
    fontSize: FontSize.lg,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  readOnlyHint: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: -Spacing.md,
    marginBottom: Spacing.md,
  },
  editScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSecondary,
  },
  editScheduleBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
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
  endMatchBtnDisabled: {
    backgroundColor: '#f87171',
    opacity: 0.5,
  },
  endMatchBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  saveScoreHint: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: -Spacing.xs,
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
