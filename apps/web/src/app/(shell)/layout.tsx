import { AppShell, AppShellHeader, AppShellMain } from '@signal/ui';
import { AuthProvider } from '../../components/auth/auth-provider';
import { EmailVerificationBanner } from '../../components/auth/email-verification-banner';
import { HeaderAuthLink } from '../../components/shell/header-auth-link';
import { PrimaryNavLinks } from '../../components/shell/primary-nav-links';
import { ThemeProvider } from '../../components/theme/theme-provider';
import { ThemeToggle } from '../../components/theme/theme-toggle';

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell>
          <AppShellHeader>
            <span className="sg-shell-brand">Signal</span>
            <PrimaryNavLinks />
            <div className="sg-shell-header__end">
              <HeaderAuthLink />
              <ThemeToggle />
            </div>
          </AppShellHeader>
          <EmailVerificationBanner />
          <AppShellMain>{children}</AppShellMain>
        </AppShell>
      </AuthProvider>
    </ThemeProvider>
  );
}
