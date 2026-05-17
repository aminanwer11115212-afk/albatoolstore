// Shared brand styles for albatool auth emails
export const BRAND = {
  primary: '#F97316', // orange-500 (matches --primary 25 95% 53%)
  primaryDark: '#EA580C',
  text: '#1F2937',
  muted: '#6B7280',
  border: '#F3F4F6',
  bg: '#FFF7ED',
}

const fontStack =
  "'Cairo','Segoe UI','Helvetica Neue',Arial,sans-serif"

export const styles = {
  main: { backgroundColor: '#ffffff', fontFamily: fontStack, margin: 0, padding: '24px 0' },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    border: `1px solid ${BRAND.border}`,
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  header: {
    background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.primaryDark})`,
    padding: '22px 28px',
    textAlign: 'right' as const,
  },
  brand: {
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: 'bold' as const,
    margin: 0,
    letterSpacing: '0.3px',
  },
  body: { padding: '28px', textAlign: 'right' as const, direction: 'rtl' as const },
  h1: {
    fontSize: '22px',
    fontWeight: 'bold' as const,
    color: BRAND.text,
    margin: '0 0 16px',
  },
  text: {
    fontSize: '15px',
    color: BRAND.text,
    lineHeight: '1.8',
    margin: '0 0 18px',
  },
  link: { color: BRAND.primaryDark, textDecoration: 'underline' },
  button: {
    backgroundColor: BRAND.primary,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 'bold' as const,
    borderRadius: '8px',
    padding: '12px 28px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  code: {
    display: 'inline-block',
    fontFamily: 'Courier, monospace',
    fontSize: '26px',
    fontWeight: 'bold' as const,
    color: BRAND.primaryDark,
    backgroundColor: BRAND.bg,
    border: `1px dashed ${BRAND.primary}`,
    borderRadius: '8px',
    padding: '14px 24px',
    letterSpacing: '6px',
    margin: '8px 0 22px',
  },
  divider: {
    borderTop: `1px solid ${BRAND.border}`,
    margin: '24px 0 16px',
  },
  footer: {
    fontSize: '12px',
    color: BRAND.muted,
    lineHeight: '1.6',
    margin: 0,
  },
  footerBar: {
    backgroundColor: '#FAFAFA',
    padding: '16px 28px',
    textAlign: 'center' as const,
    color: BRAND.muted,
    fontSize: '12px',
  },
}
