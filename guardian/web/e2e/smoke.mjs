// End-to-end smoke test of the parent dashboard against a running API + web app.
// It signs up, adds a child, pairs a simulated device, sends messages and
// locations, and walks every page (desktop + phone width), saving screenshots.
//
//   API_URL=http://localhost:3000 WEB_URL=http://localhost:3001 npm run e2e

import { chromium } from 'playwright';
const WEB = process.env.WEB_URL ?? 'http://localhost:3001';
const API = process.env.API_URL ?? 'http://localhost:3000';
const out = process.argv[2] ?? 'e2e/screenshots';
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const step = (s) => console.log('→', s);

step('signup');
await page.goto(`${WEB}/signup`);
await page.fill('#fullName', 'منى أحمد');
await page.fill('#email', `mona${Date.now()}@example.com`);
await page.fill('#password', 'a-strong-password');
await shot('01-signup');
await page.click('button[type=submit]');
await page.waitForURL('**/children/new');

step('wizard: details');
await page.fill('#displayName', 'سارة');
await page.selectOption('#birthYear', String(new Date().getFullYear() - 12));
await page.click('button[type=submit]');
step('wizard: consent');
await page.getByText('تأكيد الموافقة').waitFor();
await shot('02-consent');
const checks = page.locator('form input[type=checkbox]');
await checks.nth(3).check(); // llm_analysis — leave on to show the option
await checks.nth(3).uncheck();
await page.locator('label.check:has-text("أخبرت طفلي") input').check();
await page.locator('label.check:has-text("ولي أمر هذا الطفل") input').check();
await page.click('text=تأكيد الموافقة');
step('wizard: pairing');
await page.click('text=إنشاء رمز ربط');
const codeText = (await page.locator('.code').innerText()).replace(/\s/g, '');
await shot('03-pairing');
console.log('   code', codeText);

step('simulate child device');
const j = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return r.json();
};
const paired = await j('POST', '/v1/device/pair', { code: codeText, platform: 'android', model: 'Pixel 8', appVersion: '0.1.0' });
const now = Date.now();
console.log('  ', await j('POST', '/v1/device/messages', { items: [
  { source: 'instagram', direction: 'incoming', text: 'محد يحبك روح موت', occurredAt: new Date(now - 3600e3).toISOString() },
  { source: 'snapchat', direction: 'incoming', text: "send me a pic and don't tell your parents", occurredAt: new Date(now - 1800e3).toISOString() },
  { source: 'whatsapp', direction: 'outgoing', text: 'والله ابي اموت ما عاد فيني حيل', occurredAt: new Date(now - 600e3).toISOString() },
  { source: 'sms', direction: 'incoming', text: 'نتقابل بكرة نذاكر', occurredAt: new Date(now).toISOString() },
] }, paired.deviceToken));
console.log('  ', await j('POST', '/v1/device/locations', { points: [
  { lat: 24.7136, lng: 46.6753, accuracyM: 12, batteryPct: 64, recordedAt: new Date(now - 300e3).toISOString() },
] }, paired.deviceToken));

step('home');
await page.goto(WEB);
await page.getByText('سارة').first().waitFor();
await shot('04-home');
step('child alerts');
await page.click('text=سارة');
await page.getByText('التنبيهات').first().waitFor();
await shot('05-child-alerts');
step('alert detail (critical self-harm)');
await page.click('.alert-row >> nth=0');
await page.getByText('ماذا أفعل؟').waitFor();
await shot('06-alert-detail');
await page.click('text=تمت المعالجة');
await page.getByText('إعادة فتح').waitFor();
step('location tab');
await page.goBack();
const childUrl = page.url().split('?')[0];
await page.goto(`${childUrl}?tab=location`);
await page.getByText('الوصول والمغادرة').waitFor();
await shot('07-location');
step('settings tab: add geofence');
await page.goto(`${childUrl}?tab=settings`);
await page.fill('#gf-name', 'المدرسة');
await page.click('text=إضافة مكان');
await page.locator('li:has-text("نصف القطر")').waitFor();
await shot('08-settings');
step('screen tab: add schedule + limit');
await page.goto(`${childUrl}?tab=screen`);
await page.fill('#sch-name', 'وقت النوم');
await page.click('text=إضافة جدول');
await page.locator('li:has-text("وقت النوم")').waitFor();
await page.fill('#lim-app', 'com.zhiliaoapp.musically');
await page.click('form:has(#lim-app) button[type=submit]');
await page.locator('li:has-text("TikTok")').waitFor();
await shot('09-screen');
step('devices + consent tabs');
await page.goto(`${childUrl}?tab=devices`);
await page.getByText('Pixel 8').waitFor();
await shot('10-devices');
await page.goto(`${childUrl}?tab=consent`);
await page.getByText('الموافقة الحالية').waitFor();
await shot('11-consent');
step('account: block category, MFA setup');
await page.goto(`${WEB}/account`);
await page.locator('label.check:has-text("محتوى للبالغين") input').check();
await page.waitForTimeout(800);
await page.click('text=إعداد التحقق بخطوتين');
await page.getByAltText('رمز QR للتحقق بخطوتين').waitFor();
await shot('12-account');
console.log('   policy after category block:', JSON.stringify((await j('GET', '/v1/device/policy', null, paired.deviceToken)).filterRules));

step('mobile');
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ar', storageState: await page.context().storageState() });
await m.goto(WEB);
await m.screenshot({ path: `${out}/13-mobile-home.png`, fullPage: true });
await m.goto(`${childUrl}?tab=alerts&status=all`);
await m.screenshot({ path: `${out}/14-mobile-alerts.png`, fullPage: true });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log('   mobile horizontal overflow:', overflow);

step('logout');
await page.goto(WEB);
await page.click('text=تسجيل الخروج');
await page.waitForURL('**/login');
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
