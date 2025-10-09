import React, { useEffect, useMemo } from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useLocalization } from '../contexts/LocalizationContext';
import { MemberQrCode } from '../types/auth';
import { COLORS } from '../config/theme';
import deviceLog from '../utils/deviceLog';

type MemberQrCardProps = {
  qrCode: MemberQrCode | null | undefined;
  accountType?: string | null;
  style?: StyleProp<ViewStyle>;
};

export const MemberQrCard: React.FC<MemberQrCardProps> = ({
  qrCode,
  accountType,
  style,
}) => {
  const { t } = useLocalization();
  const qrValue = qrCode?.payload ?? qrCode?.token ?? null;

  useEffect(() => {
    deviceLog.debug('memberQrCard.state', {
      hasQrValue: Boolean(qrValue),
      tokenSuffix:
        qrCode?.token && qrCode.token.length > 4
          ? qrCode.token.slice(-4)
          : qrCode?.token ?? null,
      issuedAt: qrCode?.issuedAt ?? null,
      expiresAt: qrCode?.expiresAt ?? null,
    });
  }, [qrCode?.expiresAt, qrCode?.issuedAt, qrCode?.token, qrValue]);

  const roleLabel = useMemo(() => {
    const normalized = (accountType ?? '').toLowerCase();
    const key = normalized
      ? `profile.qr.accountTypes.${normalized}`
      : 'profile.qr.accountTypes.member';
    const defaultValue =
      normalized && normalized !== 'member'
        ? t('profile.qr.accountTypes.member')
        : undefined;
    return t(key, {
      defaultValue,
      replace: { type: accountType ?? '' },
    });
  }, [accountType, t]);

  const formattedIssuedAt = useMemo(() => {
    if (!qrCode?.issuedAt) {
      return null;
    }
    const parsed = new Date(qrCode.issuedAt);
    if (Number.isNaN(parsed.getTime())) {
      return qrCode.issuedAt;
    }
    return parsed.toLocaleString();
  }, [qrCode?.issuedAt]);

  const formattedExpiresAt = useMemo(() => {
    if (!qrCode?.expiresAt) {
      return null;
    }
    const parsed = new Date(qrCode.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return qrCode.expiresAt;
    }
    return parsed.toLocaleString();
  }, [qrCode?.expiresAt]);

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{t('profile.qr.title')}</Text>
      <Text style={styles.subtitle}>{t('profile.qr.subtitle')}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{t('profile.qr.roleLabel')}</Text>
        <Text style={styles.metaValue}>{roleLabel}</Text>
      </View>
      {qrValue ? (
        <View style={styles.qrWrapper} testID="member-qr-code">
          <QRCode value={qrValue} size={180} backgroundColor="transparent" />
          <Text style={styles.qrHint}>{t('profile.qr.hint')}</Text>
        </View>
      ) : (
        <Text style={styles.empty} testID="member-qr-empty">
          {t('profile.qr.empty')}
        </Text>
      )}
      {qrCode?.token ? (
        <Text style={styles.token} numberOfLines={1} testID="member-qr-token">
          {t('profile.qr.tokenLabel', { replace: { token: qrCode.token } })}
        </Text>
      ) : null}
      {formattedIssuedAt ? (
        <Text style={styles.footnote} testID="member-qr-issued">
          {t('profile.qr.issuedAt', { replace: { date: formattedIssuedAt } })}
        </Text>
      ) : null}
      {formattedExpiresAt ? (
        <Text style={styles.footnote} testID="member-qr-expires">
          {t('profile.qr.expiresAt', { replace: { date: formattedExpiresAt } })}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  qrWrapper: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  qrHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  empty: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  token: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  footnote: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});

