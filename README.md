# Maliyya

İki ayrı tətbiq, bir Supabase layihəsi:

| Qovluq | Nə üçündür | Giriş |
|---|---|---|
| `mobile_inputpad/` | Telefonda sürətli gəlir/xərc daxil etmə (InputPad) | Yoxdur — yalnız yazma |
| `pc_version/` | Əsas tətbiq: Dashboard, Gəlir-Xərc log, Kreditlər, Borclar, Proqnoz. Telefonda və PC-də eyni | E-poçt + şifrə (Supabase Auth) |

## Data necə axır
- InputPad → Supabase `inbox` cədvəli (anonim istifadəçi yalnız sətir əlavə edə bilər).
- Əsas tətbiq `inbox`-dakı yeni sətirləri avtomatik Gəlir-Xərc logunun sonuna əlavə edir (hər səhifədə, 15 saniyə aralıqla və səhifə açılanda).
- Əsas tətbiqin bütün datası (log, kredit, borc, proqnoz, başlanğıc qalıq) brauzer yaddaşından Supabase `app_kv` cədvəlinə güzgülənir; telefon və PC eyni datanı görür.
- Açar başına "son yazan qalib"; siyahılarda (log, kredit, borc) eyni anda edilən əlavələr birləşdirilir.
- Tema kimi cihaz ayarları sinxron olunmur.

## Quraşdırma
1. Supabase → SQL Editor: `supabase_setup.sql` (əvvəl `OWNER_UID` sözünü 2 yerdə öz UID-nizlə əvəz edin).
2. `mobile_inputpad/supabase-config.js` və `pc_version/supabase-config.js`: `url` və `anonKey` (publishable açar).
3. Authentication → Users: öz hesabınız; "Allow new users to sign up" söndürülü qalmalıdır.
4. GitHub Pages: Settings → Pages → `main` / `(root)`.
   - InputPad: `/mobile_inputpad/`
   - Əsas tətbiq: `/pc_version/`

`service_role` / secret açarını heç vaxt repoya yazmayın.
