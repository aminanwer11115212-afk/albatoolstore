/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تأكيد البريد الإلكتروني — {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading as="h2" style={styles.brand}>{siteName}</Heading>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>أهلاً بك في {siteName} 👋</Heading>
          <Text style={styles.text}>
            شكراً لتسجيلك. الرجاء تأكيد بريدك الإلكتروني <strong>{recipient}</strong> بالضغط على الزر أدناه لتفعيل حسابك:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>تأكيد البريد الإلكتروني</Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            إذا لم تقم بإنشاء حساب لدينا، يمكنك تجاهل هذه الرسالة بأمان.
          </Text>
        </Section>
        <Section style={styles.footerBar}>
          © {siteName} — نظام إدارة المبيعات والفواتير
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
