/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName, oldEmail, newEmail, confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تأكيد تغيير البريد الإلكتروني — {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading as="h2" style={styles.brand}>{siteName}</Heading>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>تأكيد تغيير البريد الإلكتروني ✉️</Heading>
          <Text style={styles.text}>
            استلمنا طلباً لتغيير البريد الإلكتروني لحسابك في <strong>{siteName}</strong> من{' '}
            <strong>{oldEmail}</strong> إلى <strong>{newEmail}</strong>.
          </Text>
          <Text style={styles.text}>اضغط على الزر أدناه لتأكيد هذا التغيير:</Text>
          <Button style={styles.button} href={confirmationUrl}>تأكيد التغيير</Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            إذا لم تقم بطلب هذا التغيير، فالرجاء تأمين حسابك فوراً وتغيير كلمة المرور.
          </Text>
        </Section>
        <Section style={styles.footerBar}>
          © {siteName} — نظام إدارة المبيعات والفواتير
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
