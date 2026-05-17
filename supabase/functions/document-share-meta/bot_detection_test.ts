// اختبارات كشف وكلاء معاينة الروابط (Link Preview Bots).
// يضمن أن دالة isLinkPreviewBot تتعرف على كل خدمة مدعومة،
// وأن المتصفحات الحقيقية لا تُصنّف كبوتات.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isLinkPreviewBot } from "./index.ts";

// (اسم الوكيل، نموذج User-Agent header)
const BOT_AGENTS: Array<[string, string]> = [
  ["WhatsApp", "WhatsApp/2.23.20.0 A"],
  ["Telegram", "TelegramBot (like TwitterBot)"],
  ["Slack", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
  ["Discord", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"],
  ["Skype", "Mozilla/5.0 (Windows NT 10.0) SkypeUriPreview Preview/0.5"],
  ["Viber", "Mozilla/5.0 ViberBot"],
  ["LINE", "Mozilla/5.0 (compatible; Line/1.0)"],
  ["KakaoTalk", "Mozilla/5.0 (compatible; KAKAOTALK-Scrap/1.0)"],
  ["Snapchat", "Snapchat/12.0 (iPhone; iOS 16)"],
  ["Facebook", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
  ["Facebot", "Facebot/1.0"],
  ["Instagram", "Instagram 250.0.0.21.109"],
  ["Twitter", "Twitterbot/1.0"],
  ["LinkedIn", "LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)"],
  ["Pinterest", "Pinterestbot/1.0 (+http://www.pinterest.com/bot.html)"],
  ["Reddit", "redditbot/1.0"],
  ["Apple iMessage / Safari preview", "Mozilla/5.0 (Macintosh) AppleWebKit/605 (KHTML, like Gecko) Applebot/0.1"],
  ["Apple LinkPreview UA", "Mozilla/5.0 (compatible; LinkPreview/1.0)"],
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["Google Inspection Tool", "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)"],
  ["Bing", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
  ["DuckDuckGo", "DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)"],
  ["Yandex", "Mozilla/5.0 (compatible; YandexBot/3.0)"],
  ["Baidu", "Mozilla/5.0 (compatible; Baiduspider/2.0)"],
  ["Embedly", "Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)"],
  ["Iframely", "Iframely/1.3.1 (+https://iframely.com/docs/about)"],
  ["VK share", "Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)"],
  ["Yahoo Slurp", "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)"],
];

// متصفحات حقيقية يجب ألا تُعتبر بوتات
const HUMAN_AGENTS: Array<[string, string]> = [
  ["Desktop Chrome", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"],
  ["iPhone Safari", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"],
  ["Android Chrome", "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"],
  ["Firefox", "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"],
  ["Empty UA", ""],
];

for (const [name, ua] of BOT_AGENTS) {
  Deno.test(`bot detected: ${name}`, () => {
    assert(isLinkPreviewBot(ua), `expected to detect bot for UA: ${ua}`);
  });
}

for (const [name, ua] of HUMAN_AGENTS) {
  Deno.test(`human not flagged: ${name}`, () => {
    assertEquals(isLinkPreviewBot(ua), false, `expected human UA, got bot: ${ua}`);
  });
}
