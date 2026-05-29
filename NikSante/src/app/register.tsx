import Head from 'expo-router/head';
import RegisterScreen from '@/screens/RegisterScreen';

export default function RegisterPage() {
  return (
    <>
      <Head>
        <title>Créer un compte – NikSanté</title>
        <meta name="description" content="Créez votre compte NikSanté gratuitement. Suivez votre diabète, enregistrez votre glycémie et accédez à des outils IA pour mieux gérer votre santé." />
        <meta property="og:title"       content="Créer un compte – NikSanté" />
        <meta property="og:description" content="Inscrivez-vous gratuitement sur NikSanté, l'application de suivi du diabète." />
        <meta name="robots" content="index, follow" />
      </Head>
      <RegisterScreen />
    </>
  );
}
