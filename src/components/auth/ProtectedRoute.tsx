import { useEffect, useState } from 'react';
import { Navigate, useLocation, useSearchParams, Link } from '@/lib/router-compat';
import { Box, CircularProgress, Typography, useTheme, Button, useMediaQuery } from '@mui/material';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Auth-gated overlay. Shown ONLY on protected routes (this component is
 * the gate), and shown BEFORE any protected UI renders — children are not
 * mounted until `isLoading` resolves. Public/marketing routes never see
 * this because they do not pass through ProtectedRoute.
 */
interface AuthCheckingOverlayProps {
  isMobile: boolean;
  knownLoggedOut: boolean;
}

const AUTH_PATHS = new Set(['/login', '/register']);

const AuthCheckingOverlay = ({ isMobile, knownLoggedOut }: AuthCheckingOverlayProps) => {
  const theme = useTheme();
  const [tier, setTier] = useState(0); // 0=initial, 1=>4s, 2=>10s, 3=>15s timeout

  useEffect(() => {
    const t1 = window.setTimeout(() => setTier(1), 4000);
    const t2 = window.setTimeout(() => setTier(2), 10000);
    const t3 = window.setTimeout(() => setTier(3), 15000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  const handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const primary =
    tier === 0
      ? 'Checking login details…'
      : tier === 1
        ? 'Still checking login details…'
        : tier === 2
          ? 'This is taking longer than usual'
          : 'Could not verify your session';

  const secondary =
    tier === 3
      ? 'The request timed out. Please check your connection and try again.'
      : tier === 2
        ? 'Your connection or the server appears slow. We are still trying to reach Shuffle.'
        : 'Contacting Shuffle to verify your session.';

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        bgcolor: 'hsl(var(--background))',
        px: 3,
        textAlign: 'center',
      }}
    >
      {tier < 3 && (
        <CircularProgress size={44} thickness={4} sx={{ color: theme.palette.primary.main }} />
      )}
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
        {primary}
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', maxWidth: 360, lineHeight: 1.5 }}>
        {secondary}
      </Typography>
      {tier === 3 && (
        <Button
          variant="outlined"
          onClick={handleRetry}
          sx={{
            mt: 1,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
            borderColor: 'hsl(var(--border))',
          }}
        >
          Try again
        </Button>
      )}

      <Box
        component="footer"
        data-testid="mobile-login-bar"
        className="mobile-login-bar"
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1400,
          bgcolor: 'hsl(var(--card))',
          borderTop: '1px solid hsl(var(--border))',
          px: 2,
          py: 1.5,
          pb: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          gap: 1.5,
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        <Button
          component={Link}
          to="/login"
          variant="outlined"
          sx={{
            flex: 1,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
            borderColor: 'hsl(var(--border))',
          }}
        >
          Sign in
        </Button>
        <Button
          component={Link}
          to="/register"
          variant="contained"
          sx={{
            flex: 1,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            bgcolor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
          }}
        >
          Create account
        </Button>
      </Box>
    </Box>
  );
};

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width:767px)');

  // The server always renders the checking overlay (no session there). Match
  // that on the client's first paint so hydration cannot mismatch, then let
  // the real auth state take over.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // On mobile we can offer login/register while the getinfo request is still
  // in flight, but only when we already know the user is logged out (no cached
  // token or user info). Cached sessions are kept optimistic and keep spinning.
  const [knownLoggedOut, setKnownLoggedOut] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('session_token');
    const info = localStorage.getItem('shuffle_user_info');
    setKnownLoggedOut(!token && !info);
  }, []);

  // Allow public access when an authorization token is present alongside a
  // resource selector — `org` for shared incident links, `execution_id` for
  // shared agent run links. Both are pre-authorized via the token in the URL,
  // so the login wall would just block a legitimately scoped page.
  const hasPublicAccess =
    searchParams.has('authorization') &&
    (searchParams.has('org') || searchParams.has('execution_id'));
  if (hasPublicAccess && hydrated) {
    return <>{children}</>;
  }

  if (isLoading || !hydrated) {
    return <AuthCheckingOverlay isMobile={isMobile} knownLoggedOut={knownLoggedOut} />;
  }

  if (!isAuthenticated) {
    // During a TanStack Router transition this layout can remain mounted while
    // the location is already changing to /login. Without this guard it would
    // keep appending a new `view` query and create an infinite redirect loop.
    if (AUTH_PATHS.has(location.pathname)) {
      return null;
    }
    const fullTarget = location.pathname + (location.search || '');
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('shuffle_redirect_after_login', fullTarget);
      } catch {}
    }
    const view = encodeURIComponent(fullTarget);
    return <Navigate to={`/login?view=${view}`} state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
