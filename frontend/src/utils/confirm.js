export function resolve(message, { confirmText = 'Confirm', cancelText = 'Cancel' } = {}) {
  return Promise.resolve(window.confirm(`${message}\n\n[${confirmText} / ${cancelText}]`));
}
