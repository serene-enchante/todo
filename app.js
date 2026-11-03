(() => {
  const LESSONS_KEY = 'steps.lessons.v1';
  const SCHEMA_KEY = 'steps.schema.v1';
  const GOOGLE_CLIENT_ID = '832955829932-qrodf84fkr56i9m2jk21lq3ip7vj055s.apps.googleusercontent.com';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE_FILE_NAME = 'steps-data-v1.json';
  const DRIVE_BOOK_FILE_NAME = 'steps-reference-book.pdf';
  const DEFAULT_SCHEMA = { title: 'title', steps: 'steps', stepTitle: 'title', stepContent: 'content' };
  const $ = (id) => document.getElementById(id);
  const library = $('library'), lessonView = $('lessonView');
  let lessons = read(LESSONS_KEY, []), schema = read(SCHEMA_KEY, DEFAULT_SCHEMA);
  let activeId = null, activeStep = 0, toastTimer;
  let googleIdentityPromise;

  function read(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
  function saveLessons() { localStorage.setItem(LESSONS_KEY, JSON.stringify(lessons)); }
  function pathValue(obj, path) {
    if (typeof path !== 'string' || !path) return undefined;
    return path.split('.').reduce((v, k) => v == null ? undefined : v[k], obj);
  }
  function firstValue(obj, paths) { for (const p of paths) { const v = pathValue(obj, p); if (v !== undefined && v !== null) return v; } }
  function normalize(input, mapping = schema) {
    // An optional `_schema` object can travel with a lesson, overriding the saved mapping.
    const map = { ...mapping, ...(input?._schema || {}) };
    const title = firstValue(input, [map.title, 'title', 'name', 'lesson.title']) ?? 'Untitled lesson';
    const rawSteps = firstValue(input, [map.steps, 'steps', 'lesson.steps', 'items']);
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) throw new Error('This file needs a non-empty steps array.');
    return {
      id: crypto.randomUUID(), title: String(title),
      steps: rawSteps.map((step, i) => {
        const heading = firstValue(step, [map.stepTitle, 'title', 'heading', 'name']);
        const body = firstValue(step, [map.stepContent, 'content', 'text', 'body', 'description']);
        const value = body ?? (typeof step === 'string' ? step : JSON.stringify(step, null, 2));
        return { title: heading == null ? '' : String(heading), content: typeof value === 'string' ? value : JSON.stringify(value, null, 2), index: i };
      }), progress: 0, updatedAt: Date.now()
    };
  }
  function renderList() {
    const list = $('lessonList'); list.replaceChildren();
    lessons.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const lesson of lessons) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'lesson-row';
      if (lesson.id === activeId) row.classList.add('selected');
      const head = document.createElement('span'); head.className = 'lesson-row-head';
      const name = document.createElement('span'); name.className = 'lesson-name'; name.textContent = lesson.title;
      const meta = document.createElement('span'); meta.className = 'lesson-meta';
      const pct = Math.round((Math.min((lesson.completed || []).length, lesson.steps.length) / lesson.steps.length) * 100);
      meta.textContent = `${pct}%`;
      head.append(name, meta);
      const track = document.createElement('span'); track.className = 'progress-track'; track.setAttribute('aria-label', `${pct}% complete`);
      const fill = document.createElement('span'); fill.className = 'progress-fill'; fill.style.width = `${pct}%`; track.append(fill);
      row.append(head, track); row.addEventListener('click', () => openLesson(lesson.id)); list.append(row);
    }
  }
  function openLesson(id) {
    activeId = id; const lesson = lessons.find(x => x.id === id); if (!lesson) return;
    lesson.completed ||= [];
    activeStep = Math.min(lesson.lastStep || 0, lesson.steps.length - 1);
    lessonView.hidden = false; $('app').classList.add('lesson-open'); renderList();
    $('lessonTitle').textContent = lesson.title;
    renderStep();
  }
  function renderStep(direction = 1) {
    const lesson = lessons.find(x => x.id === activeId); if (!lesson) return;
    const step = lesson.steps[activeStep], card = $('stepCard');
    const stage = $('stepStage');
    stage.querySelectorAll('.step-exit').forEach(node => node.remove());
    if (card.childNodes.length) {
      const outgoing = card.cloneNode(true);
      outgoing.removeAttribute('id'); outgoing.className = `step-exit ${direction >= 0 ? 'exit-up' : 'exit-down'}`;
      outgoing.setAttribute('aria-hidden', 'true'); stage.append(outgoing);
      outgoing.addEventListener('animationend', () => outgoing.remove(), { once: true });
    }
    card.classList.remove('enter-up', 'enter-down'); void card.offsetWidth;
    card.classList.add(direction >= 0 ? 'enter-up' : 'enter-down');
    card.replaceChildren();
    if (step.title) { const h = document.createElement('h2'); h.textContent = step.title; card.append(h); }
    // Keep imported content inert; rendering as text prevents uploaded JSON from injecting markup.
    const p = document.createElement('p'); p.textContent = step.content; card.append(p);
    $('stepCounter').textContent = `${activeStep + 1} / ${lesson.steps.length}`;
    const dots = $('stepDots'); dots.replaceChildren();
    lesson.steps.forEach((_, i) => {
      const done = lesson.completed.includes(i);
      const dot = document.createElement('button'); dot.type = 'button'; dot.className = `step-dot${done ? ' complete' : ''}${i === activeStep ? ' current' : ''}`;
      dot.setAttribute('aria-label', `Step ${i + 1}${done ? ', complete' : ''}`);
      dot.setAttribute('aria-current', i === activeStep ? 'step' : 'false');
      dot.addEventListener('click', () => goTo(i)); dots.append(dot);
    });
    const currentDot = dots.children[activeStep]; currentDot?.scrollIntoView({ block: 'nearest' });
  }
  function goTo(index) {
    const lesson = lessons.find(x => x.id === activeId); if (!lesson || index < 0 || index >= lesson.steps.length || index === activeStep) return;
    const direction = index > activeStep ? 1 : -1;
    activeStep = index; lesson.lastStep = index; lesson.updatedAt = Date.now();
    saveLessons(); renderStep(direction);
  }
  function completeCurrentStep() {
    const lesson = lessons.find(x => x.id === activeId); if (!lesson) return;
    lesson.completed ||= [];
    if (!lesson.completed.includes(activeStep)) lesson.completed.push(activeStep);
    lesson.updatedAt = Date.now(); saveLessons(); renderList();
    if (activeStep < lesson.steps.length - 1) goTo(activeStep + 1);
    else { renderStep(); notify('Lesson complete'); }
  }
  function notify(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
  async function copyStepJson() {
    const lesson = lessons.find(item => item.id === activeId);
    if (!lesson) return;
    window.open('https://gemini.google.com/app', '_blank', 'noopener,noreferrer');
    const current = lesson.steps[activeStep];
    const exportData = {
      lesson: {
        title: lesson.title,
        steps: lesson.steps.map(({ title, content }) => ({ title, content }))
      },
      currentStep: {
        number: activeStep + 1,
        total: lesson.steps.length,
        title: current.title,
        content: current.content
      },
      completedSteps: (lesson.completed || []).map(index => index + 1).sort((a, b) => a - b)
    };
    const json = JSON.stringify(exportData, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(json); }
        catch { copyWithFallback(json); }
      } else {
        copyWithFallback(json);
      }
      notify('Copied for Gemini. Paste it into the new tab.');
    } catch {
      notify('Could not copy JSON');
    }
  }
  function copyWithFallback(text) {
    const field = document.createElement('textarea');
    field.value = text; field.setAttribute('readonly', '');
    field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.append(field); field.select();
    const copied = document.execCommand('copy'); field.remove();
    if (!copied) throw new Error('Clipboard unavailable');
  }
  $('copyStepButton').addEventListener('click', copyStepJson);
  function loadGoogleIdentityServices() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googleIdentityPromise) return googleIdentityPromise;
    googleIdentityPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error('Google sign-in did not load'));
      script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection and try again.'));
      document.head.append(script);
    }).catch(error => { googleIdentityPromise = null; throw error; });
    return googleIdentityPromise;
  }
  async function getDriveAccessToken() {
    await loadGoogleIdentityServices();
    return new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: response => {
          if (response.error) reject(new Error(response.error_description || response.error));
          else if (response.access_token) resolve(response.access_token);
          else reject(new Error('Google did not return an access token'));
        },
        error_callback: error => reject(new Error(error.message || 'Google authorization was interrupted'))
      });
      tokenClient.requestAccessToken();
    });
  }
  async function driveRequest(url, token, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch {}
      throw new Error(detail || `Google Drive returned ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
  async function findDriveDataFile(token) {
    const query = new URLSearchParams({
      q: `name = '${DRIVE_FILE_NAME}' and trashed = false`,
      spaces: 'appDataFolder',
      fields: 'files(id,name,modifiedTime)',
      pageSize: '100'
    });
    const result = await driveRequest(`https://www.googleapis.com/drive/v3/files?${query}`, token);
    return (result.files || []).sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))[0] || null;
  }
  async function saveDriveData(token, file, data) {
    const content = JSON.stringify(data);
    if (file) {
      await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media`, token, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content
      });
      return;
    }
    const boundary = `steps_${crypto.randomUUID().replaceAll('-', '')}`;
    const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    await driveRequest(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, token, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
    });
  }
  async function findDriveBookFile(token) {
    const query = new URLSearchParams({
      q: `name = '${DRIVE_BOOK_FILE_NAME}' and trashed = false`,
      spaces: 'appDataFolder',
      fields: 'files(id,name,modifiedTime)',
      pageSize: '10'
    });
    const result = await driveRequest(`https://www.googleapis.com/drive/v3/files?${query}`, token);
    return (result.files || []).sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))[0] || null;
  }
  async function uploadBookToDrive(token, file) {
    const existing = await findDriveBookFile(token);
    const metadata = { name: DRIVE_BOOK_FILE_NAME, mimeType: 'application/pdf', description: `Uploaded source: ${file.name}` };
    if (!existing) metadata.parents = ['appDataFolder'];
    const uploadUrl = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=resumable`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
    const start = await fetch(uploadUrl, {
      method: existing ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/pdf',
        'X-Upload-Content-Length': String(file.size)
      },
      body: JSON.stringify(metadata)
    });
    if (!start.ok) {
      let detail = '';
      try { detail = (await start.json()).error?.message || ''; } catch {}
      throw new Error(detail || `Could not start book upload (${start.status})`);
    }
    const sessionUrl = start.headers.get('Location');
    if (!sessionUrl) throw new Error('Google Drive did not return an upload session');
    const result = await fetch(sessionUrl, {
      method: 'PUT',
      body: file
    });
    if (!result.ok) {
      let detail = '';
      try { detail = (await result.json()).error?.message || ''; } catch {}
      throw new Error(detail || `Book upload failed (${result.status})`);
    }
  }
  function sameSchema(a, b) {
    return Object.keys(b).every(key => a?.[key] === b[key]);
  }
  function mergeLessons(localLessons, remoteLessons) {
    const merged = new Map();
    for (const lesson of remoteLessons) if (lesson?.id && Array.isArray(lesson.steps)) merged.set(lesson.id, lesson);
    for (const lesson of localLessons) {
      if (!lesson?.id || !Array.isArray(lesson.steps)) continue;
      const remote = merged.get(lesson.id);
      if (!remote) { merged.set(lesson.id, lesson); continue; }
      const newest = (lesson.updatedAt || 0) >= (remote.updatedAt || 0) ? lesson : remote;
      const completed = [...new Set([...(remote.completed || []), ...(lesson.completed || [])])]
        .filter(index => Number.isInteger(index) && index >= 0 && index < newest.steps.length).sort((a, b) => a - b);
      merged.set(lesson.id, { ...newest, completed });
    }
    return [...merged.values()];
  }
  async function syncWithDrive() {
    const button = $('driveSyncButton');
    button.disabled = true;
    button.querySelector('span').textContent = 'Syncing…';
    try {
      const token = await getDriveAccessToken();
      const file = await findDriveDataFile(token);
      let remote = { lessons: [], schema: DEFAULT_SCHEMA };
      if (file) {
        const result = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!result.ok) throw new Error(`Could not read Drive data (${result.status})`);
        remote = await result.json();
        if (!remote || !Array.isArray(remote.lessons)) throw new Error('The saved Drive data is not a valid Steps backup');
      }
      const chosenSchema = sameSchema(schema, DEFAULT_SCHEMA) ? { ...DEFAULT_SCHEMA, ...(remote.schema || {}) } : { ...(remote.schema || DEFAULT_SCHEMA), ...schema };
      const mergedLessons = mergeLessons(lessons, remote.lessons || []);
      const payload = { schemaVersion: 1, updatedAt: Date.now(), schema: chosenSchema, lessons: mergedLessons };
      await saveDriveData(token, file, payload);
      lessons = mergedLessons; schema = chosenSchema;
      saveLessons(); localStorage.setItem(SCHEMA_KEY, JSON.stringify(schema));
      renderList();
      if (activeId) openLesson(activeId);
      notify('Drive sync complete');
    } catch (error) {
      notify(error.message || 'Drive sync failed');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Sync Drive';
    }
  }
  $('driveSyncButton').addEventListener('click', syncWithDrive);
  $('bookUploadButton').addEventListener('click', () => $('bookFile').click());
  $('bookFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify('Choose a PDF book'); return;
    }
    const button = $('bookUploadButton');
    button.disabled = true; button.querySelector('span').textContent = 'Uploading…';
    try {
      const token = await getDriveAccessToken();
      await uploadBookToDrive(token, file);
      notify('Book uploaded to private Drive storage');
    } catch (error) {
      notify(error.message || 'Book upload failed');
    } finally {
      button.disabled = false; button.querySelector('span').textContent = 'Upload book';
    }
  });
  $('uploadButton').addEventListener('click', () => $('lessonFile').click());
  $('lessonFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    try {
      const lesson = normalize(JSON.parse(await file.text()));
      lessons.unshift(lesson); saveLessons(); renderList(); notify('Lesson saved on this device');
    } catch (err) { notify(err instanceof SyntaxError ? 'Could not read that JSON file' : (err.message || 'Could not import lesson')); }
  });
  $('schemaFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const candidate = parsed.schema || parsed;
      for (const key of ['title', 'steps', 'stepTitle', 'stepContent']) if (candidate[key] !== undefined && typeof candidate[key] !== 'string') throw new Error(`Schema field “${key}” must be a dotted path string.`);
      schema = { ...DEFAULT_SCHEMA, ...candidate }; localStorage.setItem(SCHEMA_KEY, JSON.stringify(schema)); notify('Schema saved on this device');
    } catch (err) { notify(err instanceof SyntaxError ? 'Could not read that schema' : (err.message || 'Invalid schema')); }
  });
  $('backButton').addEventListener('click', () => { activeId = null; lessonView.hidden = true; $('app').classList.remove('lesson-open'); renderList(); });
  document.addEventListener('keydown', e => {
    if (lessonView.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); goTo(activeStep + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(activeStep - 1); }
    else if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); completeCurrentStep(); }
  });
  let touchY = 0;
  $('stepStage').addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
  $('stepStage').addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientY - touchY;
    if (delta < -65) goTo(activeStep + 1);
    else if (delta > 65) completeCurrentStep();
  }, { passive: true });
  renderList();
})();
