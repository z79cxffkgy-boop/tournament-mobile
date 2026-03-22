import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme';
import { apiFetch } from '../api/client';

interface Props {
  visible: boolean;
  onClose: () => void;
  matchId: number;
  homeName: string;
  awayName: string;
  currentHomeScore?: number | null;
  currentAwayScore?: number | null;
  onScoreUpdated: () => void;
}

export default function ScoreEditModal({
  visible,
  onClose,
  matchId,
  homeName,
  awayName,
  currentHomeScore,
  currentAwayScore,
  onScoreUpdated,
}: Props) {
  const [homeScore, setHomeScore] = useState(
    currentHomeScore?.toString() ?? '',
  );
  const [awayScore, setAwayScore] = useState(
    currentAwayScore?.toString() ?? '',
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_)) {
      Alert.alert('入力エラー', 'スコアを正しく入力してください');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/matches/${matchId}/score`, {
        method: 'POST',
        body: JSON.stringify({
          home_score: hs,
          away_score: as_,
          status: 'FT',
        }),
      });
      onScoreUpdated();
      onClose();
    } catch (err: any) {
      Alert.alert('エラー', err.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSchedule = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      if (homeScore) body.home_score = parseInt(homeScore, 10);
      if (awayScore) body.away_score = parseInt(awayScore, 10);
      await apiFetch(`/matches/${matchId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onScoreUpdated();
      onClose();
    } catch (err: any) {
      Alert.alert('エラー', err.message || '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>スコア入力</Text>

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
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelText}>キャンセル</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleUpdateSchedule}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? '保存中...' : 'スコア保存'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, styles.finishBtn]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? '保存中...' : '試合終了 (FT)'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
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
  actions: {
    gap: Spacing.md,
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
