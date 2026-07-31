import React from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, apiClient, type TokenResponse } from '../api/client';
import { BrandLockup } from '../components/Brand';
import { Alert, Button, Card, Input } from '../components/UI';
import { useShop } from '../context/ShopContext';
import { AurumGoogleAuth, createNonce } from '../native/googleAuth';
import { getAccessToken, setAuthData } from '../utils/auth';
import { getRecoveryPageUrl, isCloudDistribution } from '../utils/apiConfig';
import { getDeviceInfo, getDeviceUUID } from '../utils/device';
import { safeReturnPath } from '../utils/navigation';

type AuthMode = 'login' | 'register' | 'staff';

type GoogleProviderState =
  | { status: 'disabled' | 'loading' | 'unavailable'; clientId: null }
  | { status: 'enabled'; clientId: string };

interface GoogleOnboarding {
  idToken: string;
  nonce: string;
  email: string;
  fullName: string;
}

const VERIFICATION_RESEND_COOLDOWN_SECONDS = 5 * 60;

const formatCooldown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const GoogleMark: React.FC = () => (
  <svg aria-hidden="true" className="auth-google-mark" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M21.6 12.23c0-.71-.06-1.4-.19-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
    />
    <path
      fill="#34A853"
      d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"
    />
    <path
      fill="#FBBC05"
      d="M6.39 13.87A6.02 6.02 0 0 1 6.07 12c0-.65.11-1.28.32-1.87V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.61Z"
    />
    <path
      fill="#EA4335"
      d="M12 6c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.61C7.18 7.76 9.39 6 12 6Z"
    />
  </svg>
);

export const Login: React.FC = () => {
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [fullName, setFullName] = React.useState('');
  const [shopName, setShopName] = React.useState('');
  const [invitationToken, setInvitationToken] = React.useState('');
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [googleOnboarding, setGoogleOnboarding] =
    React.useState<GoogleOnboarding | null>(null);
  const [verificationEmail, setVerificationEmail] = React.useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [resetPasswordUrl, setResetPasswordUrl] = React.useState('#');
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = safeReturnPath(location.state);
  const { reload } = useShop();
  const isAndroid = Capacitor.getPlatform() === 'android';
  const supportsGoogleAuth =
    isAndroid && import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';
  const [googleProvider, setGoogleProvider] = React.useState<GoogleProviderState>({
    status: supportsGoogleAuth ? 'loading' : 'disabled',
    clientId: null,
  });

  React.useEffect(() => {
    void getRecoveryPageUrl('reset-password.html').then(setResetPasswordUrl);
  }, []);

  React.useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    const token = parameters.get('token');
    if (token) {
      setInvitationToken(token);
      setMode('staff');
    } else if (parameters.get('mode') === 'register') {
      setMode('register');
    }
    void getAccessToken().then((token) => {
      if (token) navigate(returnPath, { replace: true });
    });
  }, [navigate, location.search, returnPath]);

  React.useEffect(() => {
    if (!supportsGoogleAuth) return;
    let active = true;
    void apiClient.authProviders()
      .then(({ google }) => {
        if (!active) return;
        setGoogleProvider(
          google.enabled && google.client_id
            ? { status: 'enabled', clientId: google.client_id }
            : { status: 'unavailable', clientId: null },
        );
      })
      .catch(() => {
        if (active) setGoogleProvider({ status: 'unavailable', clientId: null });
      });
    return () => {
      active = false;
    };
  }, [supportsGoogleAuth]);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const devicePayload = async () => {
    const deviceInfo = getDeviceInfo();
    return {
      device_uuid: await getDeviceUUID(),
      device_name: deviceInfo.device_name,
      platform: deviceInfo.platform,
      app_version: deviceInfo.app_version,
    };
  };

  const finishAuthentication = async (response: TokenResponse) => {
    await setAuthData(response.access_token, response.refresh_token, {
      full_name: response.full_name,
      user_id: response.user_id,
      email: response.email,
      memberships: response.memberships,
    });
    await reload();
    navigate(returnPath, { replace: true });
  };

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPasswordVisible(false);
    setError('');
    setMessage('');
    setGoogleOnboarding(null);
    setVerificationEmail(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const device = await devicePayload();
      if (mode === 'register') {
        const response = await apiClient.register({
          email,
          password,
          full_name: fullName,
          shop_name: shopName,
          ...device,
        });
        if (response.verification_token) {
          await apiClient.verifyEmail(response.verification_token);
          setMessage('Account verified. You can now sign in.');
          setMode('login');
          setPasswordVisible(false);
        } else {
          setVerificationEmail(email.trim().toLowerCase());
          setResendCooldown(VERIFICATION_RESEND_COOLDOWN_SECONDS);
        }
        return;
      }
      const response = mode === 'staff'
        ? await apiClient.acceptInvitation({
            email,
            password,
            full_name: fullName,
            token: invitationToken,
            ...device,
          })
        : await apiClient.login({ email, password, ...device });
      await finishAuthentication(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (googleProvider.status !== 'enabled') return;
    setLoading(true);
    setError('');
    try {
      const nonce = createNonce();
      const credential = await AurumGoogleAuth.signIn({
        serverClientId: googleProvider.clientId,
        nonce,
      });
      try {
        const response = await apiClient.googleAuth({
          id_token: credential.idToken,
          nonce,
          invitation_token: mode === 'staff' ? invitationToken : undefined,
          ...(await devicePayload()),
        });
        await finishAuthentication(response);
      } catch (caught) {
        if (
          caught instanceof ApiError
          && caught.code === 'google_shop_required'
          && caught.detail?.email
          && caught.detail.full_name
        ) {
          setGoogleOnboarding({
            idToken: credential.idToken,
            nonce,
            email: caught.detail.email,
            fullName: caught.detail.full_name,
          });
          setShopName('');
          return;
        }
        throw caught;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleShop = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!googleOnboarding) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.googleAuth({
        id_token: googleOnboarding.idToken,
        nonce: googleOnboarding.nonce,
        shop_name: shopName,
        ...(await devicePayload()),
      });
      await finishAuthentication(response);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setGoogleOnboarding(null);
        setShopName('');
        setError('Your Google session expired. Continue with Google again.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to create your shop');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!verificationEmail || resendCooldown > 0) return;
    setLoading(true);
    setError('');
    try {
      await apiClient.resendVerification(verificationEmail);
      setResendCooldown(VERIFICATION_RESEND_COOLDOWN_SECONDS);
      setMessage('If your account still needs verification, a new email is on its way.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to resend verification email');
    } finally {
      setLoading(false);
    }
  };

  const googleButton = supportsGoogleAuth ? (
    <>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={loading
          || googleProvider.status !== 'enabled'
          || (mode === 'staff' && !invitationToken.trim())}
        onClick={() => void handleGoogle()}
        className="auth-google-button"
      >
        {googleProvider.status === 'enabled' ? <GoogleMark /> : null}
        {googleProvider.status === 'loading'
          ? 'Loading Google Sign-In...'
          : googleProvider.status === 'unavailable'
            ? 'Google Sign-In unavailable'
            : 'Continue with Google'}
      </Button>
      <div className="auth-divider" aria-hidden="true">
        <span>or continue with email</span>
      </div>
    </>
  ) : null;

  let content: React.ReactNode;

  if (googleOnboarding) {
    content = (
      <>
        <div className="auth-heading">
          <div className="auth-heading__icon"><ShieldCheck aria-hidden="true" /></div>
          <p className="auth-eyebrow">Google account verified</p>
          <h1>Name your shop</h1>
          <p>Choose the business name your team and invoices will use.</p>
        </div>
        <div className="auth-identity">
          <strong>{googleOnboarding.fullName}</strong>
          <span>{googleOnboarding.email}</span>
        </div>
        {error ? <Alert type="error" message={error} /> : null}
        <form className="auth-form" onSubmit={handleGoogleShop}>
          <Input
            id="google-shop-name"
            label="Shop name"
            type="text"
            required
            maxLength={150}
            autoComplete="organization"
            placeholder="For example, Aurum Jewellers"
            value={shopName}
            onChange={(event) => setShopName(event.target.value)}
          />
          <Button type="submit" size="lg" isLoading={loading} className="auth-primary">
            Create shop
          </Button>
        </form>
        <button
          type="button"
          className="auth-text-button"
          onClick={() => {
            setGoogleOnboarding(null);
            setShopName('');
            setError('');
          }}
        >
          <ArrowLeft aria-hidden="true" />
          Use another Google account
        </button>
      </>
    );
  } else if (verificationEmail) {
    content = (
      <>
        <div className="auth-heading">
          <div className="auth-heading__icon"><MailCheck aria-hidden="true" /></div>
          <p className="auth-eyebrow">One last step</p>
          <h1>Check your email</h1>
          <p>We sent a verification link to <strong>{verificationEmail}</strong>.</p>
        </div>
        <div className="auth-verification-note">
          <CheckCircle2 aria-hidden="true" />
          <p>Open the link in the email, then return here to sign in.</p>
        </div>
        {error ? <Alert type="error" message={error} /> : null}
        {message ? <Alert type="success" message={message} /> : null}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={loading || resendCooldown > 0}
          onClick={() => void handleResend()}
          className="auth-primary"
        >
          {resendCooldown > 0
            ? `Resend available in ${formatCooldown(resendCooldown)}`
            : 'Resend verification email'}
        </Button>
        <button
          type="button"
          className="auth-text-button"
          onClick={() => changeMode('login')}
        >
          <ArrowLeft aria-hidden="true" />
          Return to sign in
        </button>
      </>
    );
  } else {
    const isLogin = mode === 'login';
    const isRegister = mode === 'register';
    content = (
      <>
        <div className="auth-heading">
          <p className="auth-eyebrow">
            {mode === 'staff' ? 'Staff invitation' : 'Secure cloud access'}
          </p>
          <h1>
            {isLogin ? 'Welcome back' : isRegister ? 'Create your shop' : 'Join your team'}
          </h1>
          <p>
            {isLogin
              ? 'Sign in to manage your shop, inventory, and sales.'
              : isRegister
                ? 'Set up your Aurum POS workspace in a few moments.'
                : 'Use the invitation sent by your shop administrator.'}
          </p>
        </div>

        {mode !== 'staff' ? (
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              className={isLogin ? 'is-active' : ''}
              onClick={() => changeMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={isRegister ? 'is-active' : ''}
              onClick={() => changeMode('register')}
            >
              Create account
            </button>
          </div>
        ) : null}

        {error ? <Alert type="error" message={error} /> : null}
        {message ? <Alert type="success" message={message} /> : null}
        {googleButton}
        {isAndroid && isCloudDistribution && !supportsGoogleAuth ? (
          <p className="auth-build-note">
            Google Sign-In is available in Play test and release builds.
          </p>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister || mode === 'staff' ? (
            <Input
              id="full-name"
              label="Full name"
              type="text"
              required
              maxLength={100}
              autoComplete="name"
              placeholder="Your full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          ) : null}
          {isRegister ? (
            <Input
              id="shop-name"
              label="Shop name"
              type="text"
              required
              maxLength={150}
              autoComplete="organization"
              placeholder="Your business name"
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
            />
          ) : null}
          {mode === 'staff' ? (
            <Input
              id="invitation-token"
              label="Invitation code"
              type="text"
              required
              autoComplete="off"
              placeholder="Paste your invitation code"
              value={invitationToken}
              onChange={(event) => setInvitationToken(event.target.value)}
            />
          ) : null}
          <Input
            id="email"
            label="Email address"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            id="password"
            label="Password"
            type={passwordVisible ? 'text' : 'password'}
            required
            minLength={isRegister || mode === 'staff' ? 12 : undefined}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            placeholder={isLogin ? 'Enter your password' : 'At least 12 characters'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            trailingAction={(
              <button
                type="button"
                className="ui-input__trailing-action"
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((current) => !current)}
              >
                {passwordVisible ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </button>
            )}
          />
          {isLogin ? (
            <a
              className="auth-forgot"
              href={resetPasswordUrl}
              target="_blank"
              rel="noreferrer"
            >
              Forgot your password?
            </a>
          ) : null}
          <Button type="submit" size="lg" isLoading={loading} className="auth-primary">
            {isLogin ? 'Sign in' : isRegister ? 'Create account' : 'Accept invitation'}
          </Button>
        </form>

        {mode === 'staff' ? (
          <button
            type="button"
            className="auth-text-button"
            onClick={() => changeMode('login')}
          >
            <ArrowLeft aria-hidden="true" />
            Back to sign in
          </button>
        ) : (
          <button
            type="button"
            className="auth-text-button"
            onClick={() => changeMode('staff')}
          >
            Have a staff invitation?
          </button>
        )}
      </>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-shell__glow auth-shell__glow--one" />
      <div className="auth-shell__glow auth-shell__glow--two" />
      <div className="auth-panel">
        <div className="auth-brand">
          <BrandLockup appName="Aurum POS" isPro={false} />
          <span>Jewellery retail, beautifully managed</span>
        </div>
        <Card className="auth-card">
          {content}
        </Card>
        <p className="auth-footer">Private by design. Built for independent jewellers.</p>
      </div>
    </main>
  );
};
