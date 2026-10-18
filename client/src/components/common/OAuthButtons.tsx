import type { ReactElement } from 'react';
import { OAUTH_LABELS, OAUTH_PROVIDERS, startOAuth, type OAuthProvider } from '../../utils/oauth';

// Inline marks keep the sign-in page free of third-party requests (works offline).
const ICONS: Record<OAuthProvider, ReactElement> = {
  google: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#4285F4" />
      <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">G</text>
    </svg>
  ),
  github: (
    <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
      <path fill="currentColor" d="M8 0a8 8 0 0 0-2.500 15.600c.4.100.5-.2.5-.4v-1.400c-2.200.5-2.700-1-2.700-1-.4-.9-.9-1.200-.9-1.200-.7-.5.100-.5.100-.5.800.1 1.200.8 1.200.8.700 1.200 1.900.9 2.300.7.1-.5.3-.9.5-1.100-1.800-.2-3.600-.9-3.600-4 0-.9.3-1.600.8-2.100-.1-.2-.4-1 .1-2.100 0 0 .7-.2 2.200.8a7.500 7.500 0 0 1 4 0c1.500-1 2.200-.8 2.200-.8.4 1.100.2 1.900.1 2.100.5.600.8 1.300.8 2.100 0 3.100-1.900 3.700-3.700 3.900.3.300.6.800.6 1.500v2.200c0 .2.100.5.600.4A8 8 0 0 0 8 0z" />
    </svg>
  ),
  custom: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path fill="currentColor" d="M12 2 4 5v6c0 5 3.400 9.500 8 11 4.600-1.500 8-6 8-11V5l-8-3zm-1 14-3-3 1.400-1.400L11 13.200l4.600-4.600L17 10l-6 6z" />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 23 23" className="w-4 h-4" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  ),
};

const CONFIG_KEY: Record<OAuthProvider, string> = {
  google: 'googleOAuth',
  github: 'githubOAuth',
  microsoft: 'microsoftOAuth',
  custom: 'customOAuth',
};

/** One "Continue with …" button per enabled provider in the public /auth/config response. */
const labelOf = (provider: OAuthProvider, cfg: any) => (provider === 'custom' && cfg?.name) || OAUTH_LABELS[provider];

export default function OAuthButtons({ config, onError }: { config: any; onError: (message: string) => void }) {
  return (
    <>
      {OAUTH_PROVIDERS.filter((p) => config?.[CONFIG_KEY[p]]?.enabled && config[CONFIG_KEY[p]].clientId && (p !== 'custom' || config[CONFIG_KEY[p]].authorizeUrl)).map((provider) => (
        <button
          key={provider}
          type="button"
          data-testid={`oauth-${provider}`}
          onClick={() => startOAuth(provider, config[CONFIG_KEY[provider]]).catch(() => onError(`Failed to initiate ${labelOf(provider, config[CONFIG_KEY[provider]])} login`))}
          className="w-full bg-white border border-border text-black p-2 rounded hover:bg-gray-50 transition flex items-center justify-center gap-2 mb-2"
        >
          {ICONS[provider]}
          Continue with {labelOf(provider, config[CONFIG_KEY[provider]])}
        </button>
      ))}
    </>
  );
}
