/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface ReauthenticationEmailProps {
  siteName?: string
  token: string
}

export const ReauthenticationEmail = ({ siteName = 'albatool', token }: ReauthenticationEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رمز التحقق الخاص بك — {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading as="h2" style={styles.brand}>{siteName}</Heading>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>رمز التحقق 🔢</Heading>
          <Text style={styles.text}>استخدم الرمز التالي لتأكيد هويتك:</Text>
          <div style={{ textAlign: 'center' }}>
            <span style={styles.code}>{token}</span>
          </div>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            هذا الرمز صالح لفترة قصيرة. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.
          </Text>
        </Section>
        <Section style={styles.footerBar}>
          © {siteName} — نظام إدارة المبيعات والفواتير
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
