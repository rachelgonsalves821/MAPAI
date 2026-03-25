import { Platform, TextStyle } from 'react-native';

const SERIF_FAMILY = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

export const ONBOARDING_HEADING: TextStyle = {
  fontSize: 36,
  fontWeight: '300',
  fontFamily: SERIF_FAMILY,
  color: '#1A1A2E',
  lineHeight: 44,
};

export const ONBOARDING_HEADING_ITALIC: TextStyle = {
  ...ONBOARDING_HEADING,
  fontStyle: 'italic',
};

export const ONBOARDING_HEADING_WHITE: TextStyle = {
  ...ONBOARDING_HEADING,
  color: '#FFFFFF',
};

export const ONBOARDING_HEADING_WHITE_ITALIC: TextStyle = {
  ...ONBOARDING_HEADING_ITALIC,
  color: '#FFFFFF',
};

export const ONBOARDING_HEADING_SMALL: TextStyle = {
  ...ONBOARDING_HEADING,
  fontSize: 32,
  lineHeight: 40,
};

export const ONBOARDING_HEADING_SMALL_ITALIC: TextStyle = {
  ...ONBOARDING_HEADING_SMALL,
  fontStyle: 'italic',
};
