import { useState } from "react";

/**
 * useDocumentForm — رأس المستند: رقم/تاريخ/استحقاق/ملاحظات/خصم عام/شحن.
 * استخراج بدون أي تغيير سلوكي من InvoiceCreatePage.
 * نفس الأسماء، نفس القيم الابتدائية، نفس الترتيب.
 */
export function useDocumentForm() {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");

  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [notes, setNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");

  return {
    invoiceNumber, setInvoiceNumber,
    invoiceDate, setInvoiceDate,
    dueDate, setDueDate,
    generalDiscount, setGeneralDiscount,
    shipping, setShipping,
    notes, setNotes,
    internalNote, setInternalNote,
  };
}
