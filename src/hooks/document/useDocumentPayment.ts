import { useState } from "react";

/**
 * Hook موحّد لإدارة حالة حوار الدفع وحقول الدفعة في صفحات إنشاء المستندات.
 * نفس أسماء useState الأصلية لضمان صفر تغيير سلوكي.
 */
export function useDocumentPayment() {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [savedTotal, setSavedTotal] = useState<number>(0);
  const [savedPaid, setSavedPaid] = useState<number>(0);
  const [savedDue, setSavedDue] = useState<number>(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payAccount, setPayAccount] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState<string>("");
  const [payRef, setPayRef] = useState<string>("");
  const [payDiscount, setPayDiscount] = useState<string>("");
  const [savingPayment, setSavingPayment] = useState(false);

  return {
    paymentDialogOpen, setPaymentDialogOpen,
    savedTotal, setSavedTotal,
    savedPaid, setSavedPaid,
    savedDue, setSavedDue,
    accounts, setAccounts,
    payAmount, setPayAmount,
    payMethod, setPayMethod,
    payAccount, setPayAccount,
    payDate, setPayDate,
    payNote, setPayNote,
    payRef, setPayRef,
    payDiscount, setPayDiscount,
    savingPayment, setSavingPayment,
  };
}
