/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>إعادة تعيين كلمة المرور — {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading as="h2" style={styles.brand}>{siteName}</Heading>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>طلب استعادة كلمة المرور 🔐</Heading>
          <Text style={styles.text}>
            استلمنا طلباً لإعادة تعيين كلمة المرور لحسابك في <strong>{siteName}</strong>. اضغط على الزر أدناه لاختيار كلمة مرور جديدة:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>إعادة تعيين كلمة المرور</Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة وستبقى كلمة المرور الحالية كما هي.
          </Text>
        </Section>
        <Section style={styles.footerBar}>
          © {siteName} — نظام إدارة المبيعات والفواتير
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
