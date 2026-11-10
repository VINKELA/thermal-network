/** Convert API failures into useful messages without exposing HTML error pages. */
export function describeHeatingProfileError(error: any): string {
  if (typeof error === 'string' && !error.trim().startsWith('<')) return error;
  const status = error?.status;
  if (status === 0) {
    return 'Cannot reach the research API. Check that the Django backend is running at http://127.0.0.1:8000, then retry. A blocked browser connection can also cause this error.';
  }
  if (status === 401) return 'Your session has expired. Sign in again, then retry the comparison.';
  if (status === 403) return 'Your account does not have permission for this action in the selected project.';
  const body = error?.error;
  const flatten = (value: any): string[] => {
    if (typeof value === 'string') return value.trim().startsWith('<') ? [] : [value];
    if (Array.isArray(value)) return value.reduce((all, item) => all.concat(flatten(item)), []);
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce((all, key) => all.concat(flatten(value[key]).map(
        text => key === 'detail' || key === 'non_field_errors' ? text : `${key}: ${text}`)), []);
    }
    return [];
  };
  const messages = flatten(body);
  if (messages.length) return messages.join(' ');
  if (status === 404) return 'The selected resource or comparison is unavailable. Refresh the page and run a new comparison; check that the backend includes the latest load-profile endpoints.';
  if (status >= 500) return `The research API returned an error (HTTP ${status}). Check the Django server log for the cause; the comparison did not complete.`;
  return error?.message || 'No error details were returned. Refresh the page, retry, and check that the frontend and backend are both up to date.';
}
