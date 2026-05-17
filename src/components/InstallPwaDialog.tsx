import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share, Plus, CheckCircle2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import logo from "@/assets/logo.png";

interface InstallPwaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InstallPwaDialog({ open, onOpenChange }: InstallPwaDialogProps) {
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallPrompt();

  const handleInstall = async () => {
    const result = await promptInstall();
    if (result === "accepted") {
      toast.success("تم تثبيت التطبيق بنجاح");
      onOpenChange(false);
    } else if (result === "dismissed") {
      toast.info("تم إلغاء التثبيت");
    } else {
      toast.message("التثبيت غير متاح حالياً في هذا المتصفح");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 justify-center mb-2">
            <img src={logo} alt="البتول" className="h-12 w-auto" />
          </div>
          <DialogTitle className="text-center text-lg">تثبيت تطبيق البتول</DialogTitle>
          <DialogDescription className="text-center">
            ثبّت التطبيق على جهازك للوصول السريع ومظهر تطبيق مستقل بدون شريط متصفح.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {isInstalled && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-sm">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>التطبيق مثبَّت بالفعل على هذا الجهاز.</span>
            </div>
          )}

          {!isInstalled && canInstall && (
            <Button onClick={handleInstall} className="w-full gap-2" size="lg">
              <Download className="h-4 w-4" />
              تثبيت الآن
            </Button>
          )}

          {!isInstalled && isIOS && (
            <div className="rounded-lg border p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <Smartphone className="h-4 w-4 text-primary" />
                التثبيت على iPhone / iPad
              </div>
              <ol className="list-decimal pr-5 space-y-1 text-muted-foreground">
                <li>افتح الموقع في متصفح Safari.</li>
                <li>
                  اضغط زر المشاركة <Share className="inline h-3.5 w-3.5 mx-1" />.
                </li>
                <li>
                  اختر "إضافة إلى الشاشة الرئيسية" <Plus className="inline h-3.5 w-3.5 mx-1" />.
                </li>
                <li>اضغط "إضافة" في الأعلى.</li>
              </ol>
            </div>
          )}

          {!isInstalled && !canInstall && !isIOS && (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              إذا لم يظهر زر "تثبيت الآن"، افتح قائمة المتصفح (⋮) واختر
              <span className="font-medium text-foreground"> "تثبيت التطبيق" </span>
              أو
              <span className="font-medium text-foreground"> "إضافة إلى الشاشة الرئيسية"</span>.
              يعمل التثبيت بشكل أفضل في Chrome / Edge / Brave على رابط HTTPS منشور.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
