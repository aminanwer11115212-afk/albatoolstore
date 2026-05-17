/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رابط تسجيل الدخول — {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading as="h2" style={styles.brand}>{siteName}</Heading>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>رابط تسجيل الدخول الخاص بك 🔑</Heading>
          <Text style={styles.text}>
            اضغط على الزر أدناه لتسجيل الدخول إلى <strong>{siteName}</strong>. هذا الرابط صالح لفترة محدودة فقط.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>تسجيل الدخول</Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            إذا لم تطلب رابط الدخول، يمكنك تجاهل هذه الرسالة بأمان.
          </Text>
        </Section>
        <Section style={styles.footerBar}>
          © {siteName} — نظام إدارة المبيعات والفواتير
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
