const productionHostnames = new Set(['aurumpos.net', 'www.aurumpos.net']);
const apiOrigin = productionHostnames.has(location.hostname)
  ? 'https://api.aurumpos.net'
  : location.origin;

const statusNode = document.querySelector('[data-action-status]');

const setStatus = (message, tone = 'neutral') => {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.dataset.tone = tone;
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const requestJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(
      typeof data.detail === 'string' ? data.detail : 'Unable to complete this request.',
    );
  }
  return data;
};

const extractAndScrubToken = () => {
  const actionUrl = new URL(location.href);
  const token = new URLSearchParams(actionUrl.hash.slice(1)).get('token')
    || actionUrl.searchParams.get('token');
  if (!token) return null;
  actionUrl.hash = '';
  actionUrl.searchParams.delete('token');
  history.replaceState(null, '', actionUrl.pathname + actionUrl.search);
  return token;
};

const withBusyState = async (controls, action) => {
  controls.forEach((control) => {
    control.disabled = true;
  });
  try {
    await action();
  } finally {
    controls.forEach((control) => {
      control.disabled = false;
    });
  }
};

const initializeAccountDeletion = () => {
  const endpoint = `${apiOrigin}/api/v1/auth/account-deletion`;
  const token = extractAndScrubToken();
  const requestForm = document.querySelector('[data-deletion-request]');
  const confirmation = document.querySelector('[data-deletion-confirmation]');
  const confirmButton = document.querySelector('[data-confirm-deletion]');
  const cancelButton = document.querySelector('[data-cancel-deletion]');

  if (!requestForm || !confirmation || !confirmButton || !cancelButton) return;
  requestForm.hidden = Boolean(token);
  confirmation.hidden = !token;

  const submitToken = (action) => withBusyState(
    [confirmButton, cancelButton],
    async () => {
      setStatus('Submitting your request…');
      try {
        const data = await requestJson(`${endpoint}/${action}`, { token });
        setStatus(data.message, 'success');
        confirmation.hidden = true;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Unable to update deletion request.', 'error');
      }
    },
  );

  confirmButton.addEventListener('click', () => {
    void submitToken('confirm');
  });
  cancelButton.addEventListener('click', () => {
    void submitToken('cancel');
  });

  requestForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = requestForm.querySelector('button[type="submit"]');
    if (!(submitButton instanceof HTMLButtonElement)) return;
    void withBusyState([submitButton], async () => {
      const values = new FormData(requestForm);
      setStatus('Submitting your request…');
      try {
        const data = await requestJson(`${endpoint}/request`, {
          email: values.get('email'),
          delete_owned_shops: values.get('delete_owned_shops') === 'on',
        });
        setStatus(data.message, 'success');
        requestForm.reset();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Unable to request deletion.', 'error');
      }
    });
  });
};

const initializePasswordReset = () => {
  const endpoint = `${apiOrigin}/api/v1/auth`;
  const token = extractAndScrubToken();
  const requestForm = document.querySelector('[data-reset-request]');
  const resetForm = document.querySelector('[data-reset-password]');
  if (!requestForm || !resetForm) return;

  requestForm.hidden = Boolean(token);
  resetForm.hidden = !token;

  requestForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = requestForm.querySelector('button[type="submit"]');
    if (!(submitButton instanceof HTMLButtonElement)) return;
    void withBusyState([submitButton], async () => {
      const values = new FormData(requestForm);
      setStatus('Requesting a secure reset link…');
      try {
        const data = await requestJson(`${endpoint}/forgot-password`, {
          email: values.get('email'),
        });
        setStatus(data.message, 'success');
        requestForm.reset();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Unable to request a reset.', 'error');
      }
    });
  });

  resetForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = resetForm.querySelector('button[type="submit"]');
    if (!(submitButton instanceof HTMLButtonElement)) return;
    void withBusyState([submitButton], async () => {
      const values = new FormData(resetForm);
      setStatus('Updating your password…');
      try {
        await requestJson(`${endpoint}/reset-password`, {
          token,
          password: values.get('password'),
        });
        setStatus('Password reset. You can now sign in to Aurum POS.', 'success');
        resetForm.hidden = true;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Unable to reset your password.', 'error');
      }
    });
  });
};

const initializeEmailVerification = () => {
  const token = extractAndScrubToken();
  if (!token) {
    setStatus('This verification link is incomplete.', 'error');
    return;
  }
  setStatus('Verifying your email…');
  void requestJson(`${apiOrigin}/api/v1/auth/verify-email`, { token })
    .then(() => {
      setStatus('Email verified. You can now sign in to Aurum POS.', 'success');
    })
    .catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Verification failed.', 'error');
    });
};

const actionPage = document.body.dataset.actionPage;
if (actionPage === 'account-deletion') initializeAccountDeletion();
if (actionPage === 'reset-password') initializePasswordReset();
if (actionPage === 'verify-email') initializeEmailVerification();
