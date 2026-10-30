const TEXT = {
  privacy: {
    title: 'Privacy Policy / Gizlilik / Polityka prywatności',
    body: [
      ['EN', 'Kovan lets you sign in with Google. We only receive your name, email address and profile picture. Your notes are stored in our Supabase database and are visible only to members of the notebooks you belong to. We do not sell or share your data, and we do not show ads. To delete your account and notes, email the address below.'],
      ['TR', 'Kovan, Google ile giriş yapmanızı sağlar. Yalnızca adınızı, e-posta adresinizi ve profil fotoğrafınızı alırız. Notlarınız Supabase veritabanında saklanır ve yalnızca üyesi olduğunuz defterlerdeki kişiler görebilir. Verilerinizi satmaz veya paylaşmaz, reklam göstermeyiz. Hesabınızı ve notlarınızı sildirmek için aşağıdaki adrese yazın.'],
      ['PL', 'Kovan umożliwia logowanie przez Google. Otrzymujemy tylko Twoje imię, adres e-mail i zdjęcie profilowe. Notatki są przechowywane w bazie Supabase i widzą je tylko członkowie notesów, do których należysz. Nie sprzedajemy ani nie udostępniamy danych i nie wyświetlamy reklam. Aby usunąć konto i notatki, napisz na poniższy adres.'],
    ],
  },
  terms: {
    title: 'Terms of Service / Kullanım Şartları / Regulamin',
    body: [
      ['EN', 'Kovan is a free, non-commercial notes app provided as is, without warranty. Do not use it for unlawful content. You own your notes; keep your own backups (use Export). We may change or stop the service at any time.'],
      ['TR', 'Kovan ücretsiz, ticari olmayan bir not uygulamasıdır ve olduğu gibi, garantisiz sunulur. Yasa dışı içerik için kullanmayın. Notlar size aittir; kendi yedeğinizi alın (Dışa aktar). Hizmeti istediğimiz zaman değiştirebilir veya durdurabiliriz.'],
      ['PL', 'Kovan to bezpłatna, niekomercyjna aplikacja do notatek udostępniana w stanie takim, jaki jest, bez gwarancji. Nie używaj jej do treści niezgodnych z prawem. Notatki należą do Ciebie; rób własne kopie (Eksport). Możemy zmienić lub zakończyć usługę w dowolnym momencie.'],
    ],
  },
}

export default function Legal({ page }) {
  const p = TEXT[page]
  return (
    <main style={{ maxWidth: 680, margin: '40px auto', padding: '0 20px', lineHeight: 1.6, fontFamily: 'system-ui, sans-serif' }}>
      <h1>🐝 Kovan</h1>
      <h2>{p.title}</h2>
      {p.body.map(([l, t]) => (
        <p key={l}><b>{l}:</b> {t}</p>
      ))}
      <p>Contact: mastan96pl@gmail.com</p>
      <p><a href="/">← Kovan</a></p>
    </main>
  )
}
