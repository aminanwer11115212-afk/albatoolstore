import { useState } from "react";
import ZoomControls from "@/components/ZoomControls";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Star, ArrowRight, MapPin, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  useCustomers, useDestinations, useTransporters,
  useCustomerDestinations, useCustomerPreferredTransporter,
  useCustomerTransporters, useDestinationTransporters
} from "@/hooks/useData";

export default function CustomerLogisticsPage() {
  const { id: routeCustomerId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: customers } = useCustomers();
  const { data: destinations } = useDestinations();
  const { data: transporters } = useTransporters();

  const cd = useCustomerDestinations();
  const cpt = useCustomerPreferredTransporter();
  const ct = useCustomerTransporters();
  const dt = useDestinationTransporters();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(routeCustomerId || "");
  const [destToAdd, setDestToAdd] = useState<string>("");
  const [transToAdd, setTransToAdd] = useState<string>("");
  const [preferredTrans, setPreferredTrans] = useState<string>("");
  const [selectedDestId, setSelectedDestId] = useState<string>("");
  const [destTransToAdd, setDestTransToAdd] = useState<string>("");

  const customer = (customers || []).find((c: any) => c.id === selectedCustomerId);
  const customerDests = (cd.data || []).filter((x: any) => x.customer_id === selectedCustomerId);
  const customerTrans = (ct.data || []).filter((x: any) => x.customer_id === selectedCustomerId);
  const preferred = (cpt.data || []).find((x: any) => x.customer_id === selectedCustomerId);
  const destTrans = (dt.data || []).filter((x: any) => x.destination_id === selectedDestId);

  const addDestination = async () => {
    if (!selectedCustomerId || !destToAdd) return;
    try {
      await cd.insert.mutateAsync({ customer_id: selectedCustomerId, destination_id: destToAdd });
      toast.success("تمت إضافة الوجهة");
      setDestToAdd("");
    } catch (e: any) { toast.error(e.message); }
  };

  const setDefaultDest = async (destLinkId: string) => {
    // unset all then set this one
    for (const d of customerDests) {
      if (d.is_default) await cd.update.mutateAsync({ id: d.id, is_default: false });
    }
    await cd.update.mutateAsync({ id: destLinkId, is_default: true });
    toast.success("تم تعيين الوجهة الافتراضية");
  };

  const addTransporter = async () => {
    if (!selectedCustomerId || !transToAdd) return;
    try {
      await ct.insert.mutateAsync({ customer_id: selectedCustomerId, transporter_id: transToAdd });
      toast.success("تمت إضافة الترحيلات");
      setTransToAdd("");
    } catch (e: any) { toast.error(e.message); }
  };

  const savePreferred = async () => {
    if (!selectedCustomerId || !preferredTrans) return;
    try {
      if (preferred) {
        await cpt.update.mutateAsync({ id: preferred.id, transporter_id: preferredTrans });
      } else {
        await cpt.insert.mutateAsync({ customer_id: selectedCustomerId, transporter_id: preferredTrans });
      }
      toast.success("تم حفظ الترحيلات المفضلة");
      setPreferredTrans("");
    } catch (e: any) { toast.error(e.message); }
  };

  const addDestTransporter = async () => {
    if (!selectedDestId || !destTransToAdd) return;
    try {
      await dt.insert.mutateAsync({ destination_id: selectedDestId, transporter_id: destTransToAdd });
      toast.success("تمت إضافة الترحيلات للوجهة");
      setDestTransToAdd("");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 p-2 md:p-4" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              إدارة الوجهات والترحيلات
            </span>
            <ZoomControls />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm font-medium">اختر العميل:</div>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger><SelectValue placeholder="اختر العميل..." /></SelectTrigger>
            <SelectContent>
              {(customers || []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedCustomerId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* وجهات العميل */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />وجهات الشحن لـ {customer?.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={destToAdd} onValueChange={setDestToAdd}>
                  <SelectTrigger><SelectValue placeholder="اختر وجهة لإضافتها..." /></SelectTrigger>
                  <SelectContent>
                    {(destinations || []).filter((d: any) => !customerDests.find((x: any) => x.destination_id === d.id))
                      .map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={addDestination} size="sm"><Plus className="h-4 w-4 ml-1" />إضافة</Button>
              </div>
              <div className="space-y-2">
                {customerDests.length === 0 && <div className="text-sm text-muted-foreground">لا توجد وجهات مرتبطة</div>}
                {customerDests.map((link: any) => {
                  const d = (destinations || []).find((x: any) => x.id === link.destination_id);
                  return (
                    <div key={link.id} className="flex items-center justify-between p-2 border rounded-md">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d?.name || "—"}</span>
                        {link.is_default && <Badge variant="default"><Star className="h-3 w-3 ml-1" />افتراضي</Badge>}
                      </div>
                      <div className="flex gap-1">
                        {!link.is_default && (
                          <Button size="sm" variant="outline" onClick={() => setDefaultDest(link.id)}>
                            <Star className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => { setSelectedDestId(link.destination_id); }}>
                          <Truck className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => cd.remove.mutate(link.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* الناقل المفضل + ناقلون متعددون */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />الترحيلات المفضلة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">الترحيلات الأساسية:</div>
                <div className="flex gap-2">
                  <Select value={preferredTrans || preferred?.transporter_id || ""} onValueChange={setPreferredTrans}>
                    <SelectTrigger>
                      <SelectValue placeholder={preferred ? (transporters || []).find((t: any) => t.id === preferred.transporter_id)?.name : "اختر..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {(transporters || []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={savePreferred} size="sm">حفظ</Button>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">ناقلون إضافيون:</div>
                <div className="flex gap-2 mb-2">
                  <Select value={transToAdd} onValueChange={setTransToAdd}>
                    <SelectTrigger><SelectValue placeholder="اختر ناقلاً..." /></SelectTrigger>
                    <SelectContent>
                      {(transporters || []).filter((t: any) => !customerTrans.find((x: any) => x.transporter_id === t.id))
                        .map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={addTransporter} size="sm"><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-1">
                  {customerTrans.map((link: any) => {
                    const t = (transporters || []).find((x: any) => x.id === link.transporter_id);
                    return (
                      <div key={link.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                        <span>{t?.name || "—"}</span>
                        <Button size="sm" variant="destructive" onClick={() => ct.remove.mutate(link.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ناقلو الوجهة */}
          {selectedDestId && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">
                  الترحيلات المتاحة لوجهة: {(destinations || []).find((d: any) => d.id === selectedDestId)?.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Select value={destTransToAdd} onValueChange={setDestTransToAdd}>
                    <SelectTrigger><SelectValue placeholder="إضافة ناقل لهذه الوجهة..." /></SelectTrigger>
                    <SelectContent>
                      {(transporters || []).filter((t: any) => !destTrans.find((x: any) => x.transporter_id === t.id))
                        .map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={addDestTransporter} size="sm"><Plus className="h-4 w-4 ml-1" />إضافة</Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {destTrans.map((link: any) => {
                    const t = (transporters || []).find((x: any) => x.id === link.transporter_id);
                    return (
                      <div key={link.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                        <span>{t?.name}</span>
                        <Button size="sm" variant="destructive" onClick={() => dt.remove.mutate(link.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                  {destTrans.length === 0 && <div className="text-sm text-muted-foreground col-span-full">لا يوجد ناقلون مرتبطون</div>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
