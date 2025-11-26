import { StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const colors = {
  primary: '#FF6B35',
  secondary: '#6366f1',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  error: '#ef4444',
  success: '#10b981',
  border: '#e2e8f0',
  placeholder: '#94a3b8',
};

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    marginBottom: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonSecondary: {
    backgroundColor: colors.border,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 24,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export const dimensions = {
  width,
  height,
  isSmallScreen: width < 375,
};