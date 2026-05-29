import Head from 'expo-router/head';
import LoginScreen from '@/screens/LoginScreen';

export default function LoginPage() {
  return (
    <>
      <Head>
        <title>Connexion – NikSanté</title>
        <meta name="description" content="Connectez-vous à NikSanté pour accéder à votre tableau de bord de suivi du diabète, votre historique de glycémie et vos statistiques personnalisées." />
        <meta property="og:title"       content="Connexion – NikSanté" />
        <meta property="og:description" content="Accédez à votre espace personnel NikSanté pour suivre votre diabète." />
        <meta name="robots" content="noindex, follow" />
      </Head>
      <LoginScreen />
    </>
  );
}
