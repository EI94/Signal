import { AuthProvider } from '../../components/auth/auth-provider';
import { ThemeProvider } from '../../components/theme/theme-provider';

export default function IntelLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
