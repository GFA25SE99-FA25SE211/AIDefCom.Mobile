import Constants from "expo-constants";

type ExtraConfig = {
  googleWebClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
};

const extra = (Constants.expoConfig?.extra || {}) as ExtraConfig;

export const googleOAuthConfig = {
  webClientId: extra.googleWebClientId || undefined,
  iosClientId: extra.googleIosClientId || undefined,
  androidClientId: extra.googleAndroidClientId || undefined,
};

export const hasGoogleOAuthConfig = Boolean(
  googleOAuthConfig.webClientId ||
    googleOAuthConfig.iosClientId ||
    googleOAuthConfig.androidClientId
);

