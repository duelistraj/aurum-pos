import React from 'react';
import { Capacitor } from '@capacitor/core';
import { AlertCircle, Lock, Mail, Store, User as UserIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { AurumGoogleAuth, createNonce } from '../native/googleAuth';
import { getAccessToken, setAuthData } from '../utils/auth';
import { getDeviceInfo, getDeviceUUID } from '../utils/device';
import { safeReturnPath } from '../utils/navigation';

export const Login: React.FC = () => {
  const [mode, setMode] = React.useState<'login' | 'register' | 'staff'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [shopName, setShopName] = React.useState('');
  const [invitationToken, setInvitationToken] = React.useState('');
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = safeReturnPath(location.state);
  const { reload } = useShop();
  const googleClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;

  React.useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (token) {
      setInvitationToken(token);
      setMode('staff');
    }
    void getAccessToken().then((token) => {
      if (token) navigate(returnPath, { replace: true });
    });
  }, [navigate, location.search, returnPath]);

  const devicePayload = async () => {
    const deviceInfo = getDeviceInfo();
    return {
      device_uuid: await getDeviceUUID(),
      device_name: deviceInfo.device_name,
      platform: deviceInfo.platform,
      app_version: deviceInfo.app_version,
    };
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
        } else {
          setMessage(response.message);
        }
        setMode('login');
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
      await setAuthData(response.access_token, response.refresh_token, {
        full_name: response.full_name,
        user_id: response.user_id,
        email: response.email,
        memberships: response.memberships,
      });
      await reload();
      navigate(returnPath, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!googleClientId) return;
    setLoading(true);
    setError('');
    try {
      const nonce = createNonce();
      const credential = await AurumGoogleAuth.signIn({ serverClientId: googleClientId, nonce });
      const response = await apiClient.googleAuth({
        id_token: credential.idToken,
        nonce,
        shop_name: mode === 'register' ? shopName : undefined,
        invitation_token: mode === 'staff' ? invitationToken : undefined,
        ...(await devicePayload()),
      });
      await setAuthData(response.access_token, response.refresh_token, {
        full_name: response.full_name,
        user_id: response.user_id,
        email: response.email,
        memberships: response.memberships,
      });
      await reload();
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    ...(mode === 'register' || mode === 'staff' ? [
      { id: 'full-name', icon: UserIcon, type: 'text', value: fullName, set: setFullName, placeholder: 'Your name' },
    ] : []),
    ...(mode === 'register' ? [
      { id: 'shop-name', icon: Store, type: 'text', value: shopName, set: setShopName, placeholder: 'Shop name' },
    ] : []),
    ...(mode === 'staff' ? [
      { id: 'invitation-token', icon: Lock, type: 'text', value: invitationToken, set: setInvitationToken, placeholder: 'Invitation code' },
    ] : []),
    { id: 'email', icon: Mail, type: 'email', value: email, set: setEmail, placeholder: 'Email address' },
    { id: 'password', icon: Lock, type: 'password', value: password, set: setPassword, placeholder: 'Password' },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 transition-colors dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6 rounded-app-surface border border-slate-100 bg-white p-8 text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/10">
            <Lock className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          </div>
          <h2 className="mt-5 text-3xl font-extrabold text-slate-900 dark:text-white">
            {mode === 'login'
              ? 'Sign in to Aurum POS'
              : mode === 'register'
                ? 'Create your shop'
                : 'Join your shop'}
          </h2>
        </div>

        {error && (
          <div className="flex items-start rounded-app-inset bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
            <AlertCircle className="h-5 w-5 mr-2 flex-none" />{error}
          </div>
        )}
        {message && (
          <div className="rounded-app-inset bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {message}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {fields.map(({ id, icon: Icon, type, value, set, placeholder }) => (
            <label key={id} htmlFor={id} className="relative block">
              <span className="sr-only">{placeholder}</span>
              <Icon className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
              <input
                id={id}
                type={type}
                required
                minLength={id === 'password' && mode === 'register' ? 12 : undefined}
                className="w-full rounded-app-control border border-slate-300 bg-white py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
                placeholder={placeholder}
                value={value}
                onChange={(event) => set(event.target.value)}
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-app-control bg-amber-600 py-3 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {loading
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'register'
                  ? 'Create account'
                  : 'Accept invitation'}
          </button>
        </form>

        {googleClientId && Capacitor.getPlatform() === 'android' && (
          <button
            type="button"
            disabled={loading
              || (mode === 'register' && !shopName)
              || (mode === 'staff' && !invitationToken)}
            onClick={() => void handleGoogle()}
            className="w-full rounded-app-control border border-slate-300 bg-white py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Continue with Google
          </button>
        )}

        <button
          type="button"
          className="w-full text-sm text-amber-700 dark:text-amber-400"
          onClick={() => {
            setMode((current) => current === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'New owner? Create a shop' : 'Already registered? Sign in'}
        </button>
        {mode === 'login' && (
          <a
            className="block text-center text-sm text-slate-600 dark:text-slate-400"
            href="https://aurumpos.net/reset-password.html"
            target="_blank"
            rel="noreferrer"
          >
            Forgot your password?
          </a>
        )}
        {mode !== 'staff' && (
          <button
            type="button"
            className="w-full text-sm text-slate-600 dark:text-slate-400"
            onClick={() => {
              setMode('staff');
              setError('');
            }}
          >
            Accept a staff invitation
          </button>
        )}
      </div>
    </div>
  );
};
