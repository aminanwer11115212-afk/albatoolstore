/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>دعوة للانضمام إلى {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading as="h2" style={styles.brand}>{siteName}</Heading>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>تم دعوتك للانضمام 🎉</Heading>
          <Text style={styles.text}>
            تمت دعوتك للانضمام إلى <strong>{siteName}</strong>. اضغط على الزر أدناه لقبول الدعوة وإنشاء حسابك:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>قبول الدعوة</Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.
          </Text>
        </Section>
        <Section style={styles.footerBar}>
          © {siteName} — نظام إدارة المبيعات والفواتير
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
