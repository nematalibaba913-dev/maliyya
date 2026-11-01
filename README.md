# Maliyyə (1-ci mərhələ)

Tək tətbiq: telefonda və PC-də eyni səhifələr, tək məlumat bazası (Supabase). Mobildən girilən əməliyyat ümumi loga düşür.

## Quraşdırma

1. **Cədvəllər.** Supabase → SQL Editor → New query → `supabase/schema.sql` faylının bütün məzmununu yapışdır → Run. Table Editor-da `transactions` və `settings` görünməlidir.
2. **Bağlantı.** `js/config.js` faylında `url` dəyərini Project URL ilə əvəz et. Publishable key artıq yazılıb.
3. **İstifadəçi.** Authentication → Users → Add user ilə yaratdığın e-poçt və şifrə ilə daxil olursan. "Allow new users to sign up" söndürülü qalmalıdır.
4. **GitHub Pages.** Faylları repoya yüklə (kökdə `index.html` olsun). Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.
5. **Supabase ünvan icazəsi.** Authentication → URL Configuration → Site URL sahəsinə GitHub Pages ünvanını yaz.
6. **Telefonda.** Ünvanı Chrome (Android) və ya Safari (iPhone) ilə aç → "Ana ekrana əlavə et".

## Gizlilik yoxlaması

- Repoda yalnız URL və publishable açar var. Bunlar açıq olmaq üçündür, giriş və RLS olmadan məlumata çatmır.
- `service_role` və ya `secret` açarını repoya heç vaxt yükləmə.
- Hər iki cədvəldə Row Level Security aktivdir (yalnız `user_id = auth.uid()` sətirləri).
- Qeydiyyat söndürülüdür, yalnız əl ilə yaratdığın istifadəçi daxil ola bilər.

## Necə işləyir

- Hər əməliyyatı cihaz yaradır (`id` = UUID). Bağlantı yoxdursa IndexedDB növbəsində gözləyir, qayıdanda göndərilir. Eyni sətir iki dəfə yazılmır.
- Silmə sətri silmir, `deleted_at` doldurur.
- Telefondan girilən əməliyyat PC-də saniyələr içində görünür (Realtime).

## Növbəti mərhələlər

Dashboard, Kreditlər, Borclar, Proqnoz. Menyuda yerləri hazırdır.
