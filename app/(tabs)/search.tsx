import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing, BorderRadius, FontSize } from '../../src/theme';
import { apiFetch, setGuestToken } from '../../src/api/client';
import { useAuth } from '../../src/store/auth';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function SearchTab() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [tournamentName, setTournamentName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [joinMode, setJoinMode] = useState<'guest' | 'captain' | null>(null);
  const [captainName, setCaptainName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const qrScannedRef = useRef(false);

  const handleOpenQR = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('カメラの許可', 'QRコードを読み取るにはカメラの許可が必要です');
        return;
      }
    }
    qrScannedRef.current = false;
    setQrOpen(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (qrScannedRef.current) return;
    qrScannedRef.current = true;
    setQrOpen(false);

    // Expected QR format: tournament slug URL or just slug
    // e.g. https://example.com/tournament/my-slug or just "my-slug"
    try {
      let slug = data;
      // Try to extract slug from URL
      const urlMatch = data.match(/\/tournament\/([^/?#]+)/);
      if (urlMatch) {
        slug = urlMatch[1];
      }
      // Try to extract from query params (e.g. ?slug=xxx)
      const slugMatch = data.match(/[?&]slug=([^&#]+)/);
      if (slugMatch) {
        slug = slugMatch[1];
      }
      if (slug) {
        router.push(`/tournament/${slug}`);
      } else {
        Alert.alert('読み取りエラー', 'QRコードから大会情報を取得できませんでした');
      }
    } catch {
      Alert.alert('読み取りエラー', 'QRコードの解析に失敗しました');
    }
  };

  const handleSearch = async () => {
    if (!tournamentName.trim() || !inviteCode.trim()) {
      Alert.alert('入力エラー', '大会名と招待コードを入力してください');
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      const data = await apiFetch('/auth/tournaments/lookup', {
        method: 'POST',
        body: JSON.stringify({
          name: tournamentName.trim(),
          invite_code: inviteCode.trim(),
        }),
        skipAuth: true,
      });
      setResult(data);
    } catch (err: any) {
      Alert.alert('見つかりません', '大会名または招待コードが正しくありません');
    } finally {
      setSearching(false);
    }
  };

  const handleGuestJoin = async () => {
    try {
      const data = await apiFetch('/auth/guest/join', {
        method: 'POST',
        body: JSON.stringify({
          tournament_name: tournamentName.trim(),
          invite_code: inviteCode.trim(),
          display_name: displayName.trim() || null,
        }),
        skipAuth: true,
      });
      if (data.token) {
        await setGuestToken(data.token);
        await refreshUser();
        router.push(`/tournament/${data.tournament_slug || result.tournament_slug}`);
      }
    } catch (err: any) {
      Alert.alert('エラー', err.message || '参加に失敗しました');
    }
  };

  const handleCaptainRegister = async () => {
    if (!selectedTeam || !captainName.trim()) {
      Alert.alert('入力エラー', 'チームとキャプテン名を入力してください');
      return;
    }
    try {
      const data = await apiFetch('/auth/captain/register', {
        method: 'POST',
        body: JSON.stringify({
          tournament_name: tournamentName.trim(),
          invite_code: inviteCode.trim(),
          team_name: selectedTeam,
          captain_name: captainName.trim(),
          display_name: displayName.trim() || null,
        }),
        skipAuth: true,
      });
      if (data.token) {
        await setGuestToken(data.token);
        await refreshUser();
        router.push(`/tournament/${data.tournament_slug || result.tournament_slug}`);
      }
    } catch (err: any) {
      if (err.status === 409) {
        // Captain already registered – try login
        try {
          const loginData = await apiFetch('/auth/captain/login', {
            method: 'POST',
            body: JSON.stringify({
              tournament_name: tournamentName.trim(),
              invite_code: inviteCode.trim(),
              team_name: selectedTeam,
              captain_name: captainName.trim(),
            }),
            skipAuth: true,
          });
          if (loginData.token) {
            await setGuestToken(loginData.token);
            await refreshUser();
            router.push(`/tournament/${loginData.tournament_slug || result.tournament_slug}`);
          }
        } catch {
          Alert.alert('エラー', 'キャプテンログインに失敗しました');
        }
      } else {
        Alert.alert('エラー', err.message || '登録に失敗しました');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headerTitle}>検索</Text>
          <Text style={styles.subtitle}>
            大会名と招待コードを入力して大会を探す
          </Text>

          <TouchableOpacity style={styles.qrBtn} onPress={handleOpenQR}>
            <Ionicons name="qr-code-outline" size={20} color={Colors.primary} />
            <Text style={styles.qrBtnText}>大会用QRコードで参加</Text>
          </TouchableOpacity>

          <View style={styles.searchSection}>
            <TextInput
              style={styles.input}
              placeholder="大会名"
              placeholderTextColor={Colors.textTertiary}
              value={tournamentName}
              onChangeText={setTournamentName}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="招待コード"
              placeholderTextColor={Colors.textTertiary}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={handleSearch}
              disabled={searching}
            >
              <Ionicons name="search" size={20} color={Colors.textInverse} />
              <Text style={styles.searchBtnText}>
                {searching ? '検索中...' : '大会を検索'}
              </Text>
            </TouchableOpacity>
          </View>

          {result && (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>{result.tournament_name}</Text>
              {result.host_display_name && (
                <Text style={styles.resultHost}>
                  主催: {result.host_display_name}
                </Text>
              )}
              {result.teams && result.teams.length > 0 && (
                <Text style={styles.resultTeams}>
                  チーム: {result.teams.join(', ')}
                </Text>
              )}

              {!joinMode ? (
                <View style={styles.joinOptions}>
                  <TouchableOpacity
                    style={styles.optionBtn}
                    onPress={() => setJoinMode('guest')}
                  >
                    <Ionicons name="eye-outline" size={20} color={Colors.primary} />
                    <Text style={styles.optionText}>ゲストとして観戦</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.optionBtn}
                    onPress={() => setJoinMode('captain')}
                  >
                    <Ionicons name="shield-outline" size={20} color={Colors.primary} />
                    <Text style={styles.optionText}>キャプテンとして参加</Text>
                  </TouchableOpacity>
                </View>
              ) : joinMode === 'guest' ? (
                <View style={styles.joinForm}>
                  <TextInput
                    style={styles.input}
                    placeholder="表示名（任意）"
                    placeholderTextColor={Colors.textTertiary}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={handleGuestJoin}
                  >
                    <Text style={styles.joinBtnText}>ゲストとして参加</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setJoinMode(null)}>
                    <Text style={styles.backText}>戻る</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.joinForm}>
                  {result.teams?.map((team: string) => (
                    <TouchableOpacity
                      key={team}
                      style={[
                        styles.teamOption,
                        selectedTeam === team && styles.teamOptionSelected,
                      ]}
                      onPress={() => setSelectedTeam(team)}
                    >
                      <Text
                        style={[
                          styles.teamOptionText,
                          selectedTeam === team && styles.teamOptionTextSelected,
                        ]}
                      >
                        {team}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={styles.input}
                    placeholder="キャプテン名"
                    placeholderTextColor={Colors.textTertiary}
                    value={captainName}
                    onChangeText={setCaptainName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="表示名（任意）"
                    placeholderTextColor={Colors.textTertiary}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={handleCaptainRegister}
                  >
                    <Text style={styles.joinBtnText}>キャプテンとして参加</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setJoinMode(null)}>
                    <Text style={styles.backText}>戻る</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* QR Scanner Modal */}
      <Modal visible={qrOpen} animationType="slide">
        <SafeAreaView style={styles.qrContainer}>
          <View style={styles.qrHeader}>
            <TouchableOpacity onPress={() => setQrOpen(false)} style={styles.qrCloseBtn}>
              <Ionicons name="close" size={28} color={Colors.textInverse} />
            </TouchableOpacity>
            <Text style={styles.qrTitle}>QRコードをスキャン</Text>
            <View style={{ width: 40 }} />
          </View>
          <CameraView
            style={styles.qrCamera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcodeScanned}
          >
            <View style={styles.qrOverlay}>
              <View style={styles.qrFrame} />
              <Text style={styles.qrHint}>大会のQRコードをかざしてください</Text>
            </View>
          </CameraView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  searchSection: {
    gap: Spacing.md,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  searchBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  resultTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  resultHost: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  resultTeams: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  joinOptions: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  optionText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  joinForm: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  joinBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  backText: {
    color: Colors.textSecondary,
    textAlign: 'center',
    fontSize: FontSize.md,
    padding: Spacing.sm,
  },
  teamOption: {
    backgroundColor: Colors.surfaceSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  teamOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(37,99,235,0.06)',
  },
  teamOptionText: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  teamOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // QR button
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },

  // QR Scanner
  qrContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  qrCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  qrCamera: {
    flex: 1,
  },
  qrOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrFrame: {
    width: SCREEN_WIDTH * 0.65,
    height: SCREEN_WIDTH * 0.65,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 16,
  },
  qrHint: {
    marginTop: Spacing.xl,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
});
