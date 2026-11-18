import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

export const colors = { ink: '#1F1D1A', soft: '#4A463F', muted: '#77716A', paper: '#FAF8F4', sand: '#F1ECE4', line: '#E6E0D7', accent: '#9A4A2B', sale: '#B4232A' };

export function Section({ title, children, style }: { title?: string; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'outline'; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, kind === 'outline' ? styles.buttonOutline : styles.buttonPrimary, disabled && { opacity: 0.5 }]}
      accessibilityRole="button"
    >
      <Text style={[styles.buttonText, kind === 'outline' && { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  brand: { marginTop: 8, fontSize: 10, letterSpacing: 1, color: colors.muted },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, marginBottom: 10 },
  button: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center' },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonOutline: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  buttonText: { color: colors.paper, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', fontSize: 15 },
});
