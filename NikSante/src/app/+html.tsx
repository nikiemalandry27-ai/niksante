/**
 * NikSanté — HTML Template (web uniquement)
 *
 * Ce fichier est rendu UNIQUEMENT lors du build web (expo export --platform web).
 * Il injecte les balises SEO globales dans le <head> de toutes les pages.
 *
 * Couvre :
 *  - Métadonnées primaires (title, description, keywords, robots)
 *  - Open Graph (Facebook, LinkedIn, WhatsApp, crawlers IA)
 *  - Twitter / X Card
 *  - PWA (Progressive Web App)
 *  - JSON-LD Schema.org : SoftwareApplication + MedicalApplication
 *  - Accessibilité & langue
 */

import { ScrollViewStyleReset } from 'expo-router/html';

// ---------------------------------------------------------------------------
// Constantes — à mettre à jour avec l'URL réelle lors du déploiement
// ---------------------------------------------------------------------------

const SITE_URL   = 'https://niksante.app'; // ← remplacer par l'URL de production
const APP_NAME   = 'NikSanté';
const APP_TITLE  = 'NikSanté – Application de Suivi du Diabète & Glycémie';
const APP_DESC   =
  'NikSanté est une application mobile gratuite de suivi du diabète. ' +
  'Enregistrez votre glycémie, scannez vos aliments grâce à l\'IA, ' +
  'recevez des rappels de mesure, consultez vos statistiques et bénéficiez ' +
  'de conseils d\'urgence en cas d\'hypoglycémie ou d\'hyperglycémie.';

const APP_KEYWORDS =
  'diabète, glycémie, suivi glycémie, application diabète, ' +
  'hypoglycémie, hyperglycémie, insuline, diabète type 1, diabète type 2, ' +
  'scanner alimentaire diabète, indice glycémique, contrôle glycémique, ' +
  'suivi santé diabétique, rappels glycémie, bien-être diabète, ' +
  'NikSanté, niksante';

// ---------------------------------------------------------------------------
// Données structurées JSON-LD (Schema.org)
// Lues par Google, Bing, ChatGPT, Perplexity, et autres IA/moteurs
// ---------------------------------------------------------------------------

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: APP_NAME,
      alternateName: 'NikSante',
      description: APP_DESC,
      url: SITE_URL,
      applicationCategory: 'HealthApplication',
      applicationSubCategory: 'Medical',
      operatingSystem: 'iOS 14.0+, Android 8.0+, Web',
      inLanguage: 'fr-FR',
      softwareVersion: '1.0.0',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
      },
      featureList: [
        'Suivi de glycémie en temps réel',
        'Scanner alimentaire avec intelligence artificielle (OpenAI GPT-4o)',
        'Rappels de mesure personnalisables (matin, après-midi, soir)',
        'Tableau de bord avec statistiques avancées et graphiques',
        'Calcul du Temps Dans la Cible (TIR)',
        'Conseils d\'urgence hypoglycémie et hyperglycémie',
        'Journal d\'humeur quotidien',
        'Exercices de respiration 4-7-8 anti-stress',
        'Système de gamification : badges et récompenses',
        'Historique complet avec filtres et export',
      ],
      author: {
        '@type': 'Organization',
        name: APP_NAME,
        url: SITE_URL,
      },
      audience: {
        '@type': 'MedicalAudience',
        audienceType: 'Patient',
        healthCondition: {
          '@type': 'MedicalCondition',
          name: 'Diabète',
          alternateName: ['Diabetes mellitus', 'Diabète type 1', 'Diabète type 2'],
          code: {
            '@type': 'MedicalCode',
            code: 'E11',
            codingSystem: 'ICD-10',
          },
        },
      },
      screenshot: `${SITE_URL}/screenshot.png`,
      image: `${SITE_URL}/og-image.png`,
    },
    {
      '@type': 'WebSite',
      name: APP_NAME,
      url: SITE_URL,
      description: APP_DESC,
      inLanguage: 'fr-FR',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Comment NikSanté aide les diabétiques à gérer leur glycémie ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'NikSanté permet d\'enregistrer facilement les mesures de glycémie, de les visualiser sur des graphiques, de recevoir des rappels de mesure et d\'obtenir des conseils personnalisés selon votre niveau de glycémie.',
          },
        },
        {
          '@type': 'Question',
          name: 'Le scanner alimentaire IA fonctionne-t-il sans connexion ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Le scanner alimentaire utilise l\'intelligence artificielle (OpenAI GPT-4o Vision) et nécessite une connexion internet pour analyser l\'aliment photographié et calculer son impact glycémique estimé.',
          },
        },
        {
          '@type': 'Question',
          name: 'NikSanté est-il gratuit ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Oui, NikSanté est entièrement gratuit. Téléchargez l\'application sur iOS ou Android sans frais ni abonnement.',
          },
        },
        {
          '@type': 'Question',
          name: 'Que faire en cas d\'hypoglycémie ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'En cas d\'hypoglycémie (glycémie < 70 mg/dL), boire 150–200 ml de jus de fruit sucré, manger 3–4 morceaux de sucre, attendre 15 minutes et remesurer. Si la personne est inconsciente, ne pas forcer à boire et appeler les secours.',
          },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr">
      <head>
        {/* ── Encodage & Compatibilité ── */}
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* ── Titre & Métadonnées Primaires ── */}
        <title>{APP_TITLE}</title>
        <meta name="title"       content={APP_TITLE} />
        <meta name="description" content={APP_DESC} />
        <meta name="keywords"    content={APP_KEYWORDS} />
        <meta name="author"      content={APP_NAME} />
        <meta name="robots"      content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        <meta name="language"    content="French" />
        <meta name="revisit-after" content="30 days" />
        <link rel="canonical"    href={SITE_URL} />

        {/* ── Apparence & Thème ── */}
        <meta name="theme-color"   content="#388E3C" media="(prefers-color-scheme: light)" />
        <meta name="theme-color"   content="#1C1C1E" media="(prefers-color-scheme: dark)" />
        <meta name="color-scheme"  content="light dark" />
        <meta name="msapplication-TileColor" content="#388E3C" />

        {/* ── PWA (Progressive Web App) ── */}
        <meta name="application-name"              content={APP_NAME} />
        <meta name="mobile-web-app-capable"        content="yes" />
        <meta name="apple-mobile-web-app-capable"  content="yes" />
        <meta name="apple-mobile-web-app-title"    content={APP_NAME} />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="manifest"         href="/manifest.json" />

        {/* ── Open Graph (Facebook, LinkedIn, WhatsApp, crawlers IA) ── */}
        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={SITE_URL} />
        <meta property="og:site_name"   content={APP_NAME} />
        <meta property="og:title"       content={APP_TITLE} />
        <meta property="og:description" content={APP_DESC} />
        <meta property="og:image"       content={`${SITE_URL}/og-image.png`} />
        <meta property="og:image:width"  content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt"   content={`${APP_NAME} – Application suivi diabète`} />
        <meta property="og:locale"      content="fr_FR" />

        {/* ── Twitter / X Card ── */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content={APP_TITLE} />
        <meta name="twitter:description" content={APP_DESC} />
        <meta name="twitter:image"       content={`${SITE_URL}/og-image.png`} />
        <meta name="twitter:image:alt"   content={`${APP_NAME} – Application suivi diabète`} />

        {/* ── Données Structurées JSON-LD (Schema.org) ── */}
        {/* Lues par Google, Bing, ChatGPT, Perplexity, Claude, etc. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD, null, 0) }}
        />

        {/* ── Polices ── */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* ── Reset CSS Expo (obligatoire pour React Native Web) ── */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
