export const safeReturnPath = (state: unknown): string => {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return '/';
  }
  const from = state.from;
  if (!from || typeof from !== 'object' || !('pathname' in from)) {
    return '/';
  }
  const pathname = from.pathname;
  if (
    typeof pathname !== 'string'
    || !pathname.startsWith('/')
    || pathname.startsWith('//')
    || pathname.includes('\\')
  ) {
    return '/';
  }
  return pathname;
};
