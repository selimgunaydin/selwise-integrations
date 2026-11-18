import { createElement as h, Fragment, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { pickId } from '../pick-ids.js';
import { interactionVersionOf } from '../../vendor/campaign-interaction.js';
import { SelwiseText as Text } from '../host-hooks.js';
import { appString } from '../strings.js';
import { color, textStyle } from '../styles.js';
import { SurfaceCard, SurfaceModal } from './card.js';
import { contentOf, stylesOf, type SurfaceRendererProps } from './types.js';

// The web form's own phone rule: an international number.
const PHONE_REGEX = /^\+[1-9][\d\s\-()]{6,17}$/;

const DEFAULT_SMS_CONSENT = 'Kampanya ve sipariş bilgilerini SMS ile almayı kabul ediyorum.';
const DEFAULT_PRIVACY_TEXT = 'Aydınlatma metni';

/** The opt-in's evidence: the wording the form showed, and the version of that wording. */
export interface NewsletterConsent {
  text: string;
  version: string;
}

export interface NewsletterProps extends Omit<SurfaceRendererProps, 'onPress'> {
  /**
   * Sends the signup. Answers `{ success: false }` (or throws) for one that was
   * not accepted. `consent` is the wording the form showed next to the field,
   * exactly as shown, and its version — the signup's evidence.
   */
  onSubmit: (
    email: string,
    sms?: { phone: string; smsConsent: true },
    consent?: NewsletterConsent
  ) => Promise<{ success: boolean } | void>;
  /** Opens the privacy notice's link. */
  onOpenLink?: (url: string) => unknown;
  /** Drawn in a point of the screen (a card in the flow, no window, no trigger) instead of over it. */
  inSlot?: boolean;
  /** The viewer's language, for the sentences the merchant did not write. */
  locale?: string | null;
}

/** The consent lines the form shows for this content, as the shopper reads them. */
export function newsletterConsentLines(content: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const collectPhone = content['collectPhone'] === true || content['collectPhone'] === 'true';
  if (collectPhone) lines.push(String(content['smsConsentText'] || DEFAULT_SMS_CONSENT));
  const privacyUrl = String(content['privacyNoticeUrl'] || '').trim();
  if (/^(https?:\/\/|\/(?!\/))/i.test(privacyUrl)) lines.push(String(content['privacyNoticeText'] || DEFAULT_PRIVACY_TEXT));
  return lines;
}

/** The evidence for a signup, or undefined when the form showed no consent wording at all. */
export function newsletterConsent(content: Record<string, unknown>): NewsletterConsent | undefined {
  const text = newsletterConsentLines(content).join('\n').trim();
  return text ? { text, version: interactionVersionOf({ contentJson: { consentText: text } }) } : undefined;
}

/**
 * The newsletter form.
 *
 * State lives here rather than in the overlay: the overlay re-renders on every
 * navigation, and a half-typed email must survive that.
 *
 * Every sentence is the merchant's (`headline`, `emailPlaceholder`,
 * `successMessage`, and the button's three labels: idle, sending, done); a
 * stored sentence is never replaced by a default of ours, and an unset working or
 * finished label means "do not relabel" — the button keeps the merchant's own.
 */
export function Newsletter(props: NewsletterProps): ReactElement {
  const { surface, onSubmit, onDismiss, onOpenLink, inSlot, locale } = props;
  const styles = stylesOf(surface);
  const content = contentOf(surface);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error' | 'badPhone'>('idle');

  // As on the web form: a phone field and its OWN consent line, off unless the
  // merchant turned `collectPhone` on. The tick is the consent, not the number.
  const collectPhone = content['collectPhone'] === true || content['collectPhone'] === 'true';
  // The privacy notice the address is collected under: a line under the form,
  // only with an http(s) or same-site link (the field is free text).
  const privacyUrl = String(content['privacyNoticeUrl'] || '').trim();
  const showPrivacy = /^(https?:\/\/|\/(?!\/))/i.test(privacyUrl);

  const inputStyle = [
    sheet.input,
    {
      backgroundColor: color(styles['inputBackgroundColor']) || '#ffffff',
      borderColor: color(styles['inputBorderColor']) || '#d9d9d9',
      color: color(styles['inputTextColor']) || '#1a1a1a',
    },
  ];

  const submit = async () => {
    if (!email.includes('@') || state === 'sending') return;
    if (collectPhone && smsConsent && !PHONE_REGEX.test(phone.trim())) {
      setState('badPhone');
      return;
    }
    setState('sending');
    try {
      const result = await onSubmit(
        email,
        collectPhone && smsConsent ? { phone: phone.trim(), smsConsent: true } : undefined,
        newsletterConsent(content)
      );
      // The signup answers `{ success: false }` rather than throwing, so awaiting
      // it was never enough: a rejected signup said "Teşekkürler!".
      setState(result && result.success === false ? 'error' : 'done');
    } catch {
      setState('error');
    }
  };

  const body =
    state === 'done'
      ? h(
          Text,
          { testID: pickId('text', 'successText'), style: [sheet.line, textStyle(styles, { defaultSize: 14 })] },
          String(content['successText'] || 'Teşekkürler!')
        )
      : h(
          View,
          { style: sheet.formRow },
          h(TextInput, {
            testID: pickId('text', 'placeholder'),
            value: email,
            onChangeText: setEmail,
            placeholder: String(content['placeholder'] || 'E-posta adresiniz'),
            placeholderTextColor: '#9ca3af',
            keyboardType: 'email-address',
            autoCapitalize: 'none',
            autoCorrect: false,
            editable: state !== 'sending',
            style: inputStyle,
          }),
          state === 'sending' ? h(ActivityIndicator, { style: sheet.spinner }) : null
        );
  const phoneField =
    collectPhone && state !== 'done'
      ? h(
          View,
          { style: sheet.consentBlock },
          h(TextInput, {
            testID: pickId('text', 'phonePlaceholder'),
            value: phone,
            onChangeText: setPhone,
            placeholder: String(content['phonePlaceholder'] || '+90 5XX XXX XX XX'),
            placeholderTextColor: '#9ca3af',
            keyboardType: 'phone-pad',
            editable: state !== 'sending',
            style: inputStyle,
          }),
          h(
            Pressable,
            {
              onPress: () => setSmsConsent(!smsConsent),
              accessibilityRole: 'checkbox',
              testID: pickId('text', 'smsConsentText'),
              accessibilityState: { checked: smsConsent },
              style: sheet.consentRow,
            },
            h(Text, { style: [sheet.line, textStyle(styles, { defaultSize: 16 })] }, smsConsent ? '☑' : '☐'),
            h(
              Text,
              { style: [sheet.consentText, textStyle(styles, { defaultSize: 12 })] },
              String(content['smsConsentText'] || DEFAULT_SMS_CONSENT)
            )
          )
        )
      : null;
  const privacyLine =
    showPrivacy && state !== 'done'
      ? h(
          Pressable,
          { onPress: () => (typeof onOpenLink === 'function' ? onOpenLink(privacyUrl) : null), accessibilityRole: 'link', testID: pickId('text', 'privacyNoticeText') },
          h(
            Text,
            { style: [sheet.privacy, textStyle(styles, { defaultSize: 11 })] },
            String(content['privacyNoticeText'] || DEFAULT_PRIVACY_TEXT)
          )
        )
      : null;
  // The merchant's own error sentence when they wrote one, else a plain default.
  // Shown under the form, which stays editable so the visitor can try again.
  const errorText =
    state === 'error'
      ? String(content['errorMessage'] || 'Kaydınız alınamadı. Lütfen tekrar deneyin.')
      : state === 'badPhone'
        ? String(content['errorMessage'] || 'Geçerli bir telefon numarası girin (örn. +90 5XX XXX XX XX).')
        : null;
  const errorLine = errorText
    ? h(Text, { style: [sheet.line, textStyle(styles, { defaultSize: 13 }), { color: '#b91c1c' }] }, errorText)
    : null;

  // The button's three labels: the merchant's own for each state, and their
  // plain label wherever they wrote none ("do not relabel").
  const plain = String(content['buttonText'] || '').trim() || appString('newsletter.subscribe', locale);
  const working = String(content['submittingButtonText'] ?? '').trim() || plain;
  const finished = String(content['successButtonText'] ?? '').trim() || plain;
  const label = state === 'sending' ? working : state === 'done' ? finished : plain;

  const card = {
    surface,
    onDismiss,
    onPress: state === 'done' ? onDismiss : submit,
    buttonLabel: label,
    buttonDisabled: state === 'sending',
    titleKeys: { sizeKey: 'headlineFontSize', weightKey: 'headlineFontWeight' },
  };
  const form = h(Fragment, null, body, phoneField, privacyLine, errorLine);

  // A newsletter in a point is a card in the screen's flow; otherwise a window,
  // which a stray tap on its scrim must not close (the web's card has no scrim).
  return inSlot
    ? h(SurfaceCard, card, form)
    : h(SurfaceModal, { ...card, dismissOnBackdrop: false }, form);
}

const sheet = StyleSheet.create({
  line: {},
  consentBlock: { width: '100%', gap: 8 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  consentText: { flex: 1 },
  privacy: { textDecorationLine: 'underline', opacity: 0.8 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  spinner: { marginLeft: 4 },
});
