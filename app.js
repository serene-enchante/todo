(() => {
  const LESSONS_KEY = 'steps.lessons.v1';
  const SCHEMA_KEY = 'steps.schema.v1';
  const BOOKS_KEY = 'steps.books.v1';
  const ACTIVE_BOOK_KEY = 'steps.activeBook.v1';
  const GOOGLE_CLIENT_ID = '832955829932-qrodf84fkr56i9m2jk21lq3ip7vj055s.apps.googleusercontent.com';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE_FILE_NAME = 'steps-data-v1.json';
  const DRIVE_BOOK_FILE_PREFIX = 'steps-book-';
  const LEGACY_BOOK_FILE_NAME = 'steps-reference-book.pdf';
  const ADD_BOOK_OPTION = '__add_book__';
  const UNASSIGNED_OPTION = '__unassigned__';
  const DEFAULT_SCHEMA = { title: 'title', steps: 'steps', stepTitle: 'title', stepContent: 'content' };
  const $ = (id) => document.getElementById(id);
  const library = $('library'), lessonView = $('lessonView');
  let lessons = read(LESSONS_KEY, []), schema = read(SCHEMA_KEY, DEFAULT_SCHEMA);
  const savedBookId = localStorage.getItem(ACTIVE_BOOK_KEY);
  let books = read(BOOKS_KEY, []), activeBookId = savedBookId === '__unassigned__' ? null : (savedBookId || '__first_book__');
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
      id: crypto.randomUUID(), title: String(title), bookId: activeBookId,
      steps: rawSteps.map((step, i) => {
        const heading = firstValue(step, [map.stepTitle, 'title', 'heading', 'name']);
        const body = firstValue(step, [map.stepContent, 'content', 'text', 'body', 'description']);
        const rawCitations = firstValue(step, [map.stepCitations, 'citations', 'citation']);
        const value = body ?? (typeof step === 'string' ? step : JSON.stringify(step, null, 2));
        const citations = rawCitations == null ? [] : (Array.isArray(rawCitations) ? rawCitations : [rawCitations])
          .filter(citation => citation != null)
          .map(citation => typeof citation === 'string' ? { source: citation } : (typeof citation === 'object' && !Array.isArray(citation) ? { ...citation } : { source: String(citation) }));
        return { title: heading == null ? '' : String(heading), content: typeof value === 'string' ? value : JSON.stringify(value, null, 2), citations, index: i };
      }), progress: 0, updatedAt: Date.now()
    };
  }
  function importLessonJson(text) {
    if (!text.trim()) throw new Error('Paste lesson JSON first');
    const lesson = normalize(JSON.parse(text));
    lessons.unshift(lesson); saveLessons(); renderList();
    return lesson;
  }
  function notifyLessonImported(lesson) {
    const book = books.find(item => item.id === lesson.bookId);
    notify(book ? `Lesson added to ${book.title}` : 'Lesson added');
  }
  function renderBookSelect() {
    const select = $('bookSelect');
    const hasUnassigned = lessons.some(lesson => !lesson.bookId);
    if (activeBookId === '__first_book__') activeBookId = books[0]?.id || null;
    if (activeBookId && !books.some(book => book.id === activeBookId)) activeBookId = books[0]?.id || null;
    if (!activeBookId && books.length && !hasUnassigned) activeBookId = books[0].id;
    select.replaceChildren();
    if (!books.length && !hasUnassigned) {
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'No books'; empty.disabled = true; select.append(empty);
    }
    for (const book of books) {
      const option = document.createElement('option'); option.value = book.id; option.textContent = book.title; select.append(option);
    }
    if (hasUnassigned) {
      const option = document.createElement('option'); option.value = UNASSIGNED_OPTION; option.textContent = 'Unassigned'; select.append(option);
    }
    const addBook = document.createElement('option'); addBook.value = ADD_BOOK_OPTION; addBook.textContent = '+ Add new book…'; select.append(addBook);
    select.value = activeBookId || (hasUnassigned ? UNASSIGNED_OPTION : '');
    if (select.value !== ADD_BOOK_OPTION) select.dataset.previousValue = select.value;
    localStorage.setItem(ACTIVE_BOOK_KEY, activeBookId || '__unassigned__');
  }
  function renderList() {
    renderBookSelect();
    const list = $('lessonList'); list.replaceChildren();
    lessons.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const lesson of lessons.filter(item => (item.bookId || null) === activeBookId)) {
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
    activeBookId = lesson.bookId || null;
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
    if (step.citations?.length) {
      const citationList = document.createElement('div'); citationList.className = 'step-citations';
      for (const citation of step.citations) {
        const source = citation.source || citation.book || citation.title || 'Source';
        const printedPage = citation.page ?? citation.printedPage;
        const pdfPage = citation.pdfPage;
        const lineRange = citation.lines ?? citation.lineRange ?? (citation.lineStart != null || citation.lineEnd != null
          ? `${citation.lineStart ?? '?'}–${citation.lineEnd ?? '?'}` : null);
        const details = [String(source)];
        if (printedPage != null) details.push(`p. ${printedPage}`);
        if (pdfPage != null && String(pdfPage) !== String(printedPage)) details.push(`PDF p. ${pdfPage}`);
        if (lineRange != null && lineRange !== '') details.push(`lines ${lineRange}`);
        if (citation.section) details.push(String(citation.section));
        const entry = document.createElement('div'); entry.className = 'step-citation';
        const label = document.createElement('p'); label.className = 'step-citation-label'; label.textContent = details.join(' · '); entry.append(label);
        if (citation.quote) { const quote = document.createElement('p'); quote.className = 'step-citation-quote'; quote.textContent = `“${citation.quote}”`; entry.append(quote); }
        citationList.append(entry);
      }
      card.append(citationList);
    }
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
        steps: lesson.steps.map(({ title, content, citations }) => ({ title, content, ...(citations?.length ? { citations } : {}) }))
      },
      currentStep: {
        number: activeStep + 1,
        total: lesson.steps.length,
        title: current.title,
        content: current.content,
        ...(current.citations?.length ? { citations: current.citations } : {})
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
  async function findLegacyDriveBookFile(token) {
    const query = new URLSearchParams({
      q: `name = '${LEGACY_BOOK_FILE_NAME}' and trashed = false`,
      spaces: 'appDataFolder',
      fields: 'files(id,name,description,modifiedTime)',
      pageSize: '1'
    });
    const result = await driveRequest(`https://www.googleapis.com/drive/v3/files?${query}`, token);
    return result.files?.[0] || null;
  }
  async function uploadBookToDrive(token, file, bookId) {
    const driveName = `${DRIVE_BOOK_FILE_PREFIX}${bookId}.pdf`;
    const query = new URLSearchParams({
      q: `name = '${driveName}' and trashed = false`, spaces: 'appDataFolder', fields: 'files(id)', pageSize: '1'
    });
    const matches = await driveRequest(`https://www.googleapis.com/drive/v3/files?${query}`, token);
    const existing = matches.files?.[0] || null;
    const metadata = { name: driveName, mimeType: 'application/pdf', description: `Uploaded source: ${file.name}` };
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
    const uploaded = await result.json();
    return {
      id: bookId,
      title: file.name.replace(/\.pdf$/i, ''),
      fileId: uploaded.id,
      driveName,
      updatedAt: Date.now()
    };
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
      merged.set(lesson.id, { ...newest, bookId: newest.bookId || remote.bookId || lesson.bookId || null, completed });
    }
    return [...merged.values()];
  }
  function mergeBooks(localBooks, remoteBooks) {
    const merged = new Map();
    for (const book of remoteBooks) if (book?.id) merged.set(book.id, book);
    for (const book of localBooks) {
      if (!book?.id) continue;
      const remote = merged.get(book.id);
      if (!remote || (book.updatedAt || 0) >= (remote.updatedAt || 0)) merged.set(book.id, book);
    }
    return [...merged.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  async function syncWithDrive(accessToken = null, announce = true) {
    const button = $('driveSyncButton');
    button.disabled = true;
    button.querySelector('span').textContent = 'Syncing…';
    try {
      const token = accessToken || await getDriveAccessToken();
      const file = await findDriveDataFile(token);
      let remote = { lessons: [], books: [], schema: DEFAULT_SCHEMA };
      if (file) {
        const result = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!result.ok) throw new Error(`Could not read Drive data (${result.status})`);
        remote = await result.json();
        if (!remote || !Array.isArray(remote.lessons)) throw new Error('The saved Drive data is not a valid Steps backup');
      }
      const remoteBooks = Array.isArray(remote.books) ? [...remote.books] : [];
      const legacyFile = await findLegacyDriveBookFile(token);
      let migratedLegacyBookId = null;
      if (legacyFile && ![...books, ...remoteBooks].some(book => book.fileId === legacyFile.id)) {
        const sourceName = legacyFile.description?.replace(/^Uploaded source:\s*/, '') || 'Reference book.pdf';
        migratedLegacyBookId = `legacy-${legacyFile.id}`;
        remoteBooks.push({
          id: migratedLegacyBookId,
          title: sourceName.replace(/\.pdf$/i, ''),
          fileId: legacyFile.id,
          driveName: legacyFile.name,
          updatedAt: Date.parse(legacyFile.modifiedTime) || Date.now()
        });
      }
      const chosenSchema = sameSchema(schema, DEFAULT_SCHEMA) ? { ...DEFAULT_SCHEMA, ...(remote.schema || {}) } : { ...(remote.schema || DEFAULT_SCHEMA), ...schema };
      const mergedLessons = mergeLessons(lessons, remote.lessons || []);
      if (migratedLegacyBookId && !books.length && !remoteBooks.some(book => book.id !== migratedLegacyBookId)) {
        for (const lesson of mergedLessons) if (!lesson.bookId) lesson.bookId = migratedLegacyBookId;
      }
      const mergedBooks = mergeBooks(books, remoteBooks);
      const payload = { schemaVersion: 1, updatedAt: Date.now(), schema: chosenSchema, lessons: mergedLessons, books: mergedBooks };
      await saveDriveData(token, file, payload);
      lessons = mergedLessons; books = mergedBooks; schema = chosenSchema;
      saveLessons(); localStorage.setItem(BOOKS_KEY, JSON.stringify(books)); localStorage.setItem(SCHEMA_KEY, JSON.stringify(schema));
      if (activeBookId && !books.some(book => book.id === activeBookId)) activeBookId = null;
      renderList();
      if (activeId) openLesson(activeId);
      if (announce) notify('Drive sync complete');
      return true;
    } catch (error) {
      if (announce) notify(error.message || 'Drive sync failed');
      return false;
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Sync Drive';
    }
  }
  $('driveSyncButton').addEventListener('click', () => syncWithDrive());
  $('bookSelect').addEventListener('change', event => {
    const selected = event.target.value;
    if (selected === ADD_BOOK_OPTION) {
      event.target.value = event.target.dataset.previousValue || '';
      $('bookFile').click();
      return;
    }
    activeBookId = selected === UNASSIGNED_OPTION || !selected ? null : selected;
    localStorage.setItem(ACTIVE_BOOK_KEY, activeBookId || '__unassigned__');
    activeId = null; lessonView.hidden = true; $('app').classList.remove('lesson-open');
    renderList();
  });
  $('bookFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify('Choose a PDF book'); return;
    }
    const select = $('bookSelect'), addLessonButton = $('uploadButton');
    select.disabled = true; addLessonButton.disabled = true;
    const hasBooksAlready = books.length > 0;
    try {
      const token = await getDriveAccessToken();
      const bookId = crypto.randomUUID();
      const book = await uploadBookToDrive(token, file, bookId);
      books.unshift(book); activeBookId = book.id;
      if (!hasBooksAlready) {
        for (const lesson of lessons) if (!lesson.bookId) lesson.bookId = book.id;
        saveLessons();
      }
      localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
      localStorage.setItem(ACTIVE_BOOK_KEY, activeBookId);
      activeId = null; lessonView.hidden = true; $('app').classList.remove('lesson-open'); renderList();
      const synced = await syncWithDrive(token, false);
      notify(synced ? 'Book added and synced' : 'Book uploaded. Sync Drive to share it across devices.');
    } catch (error) {
      notify(error.message || 'Book upload failed');
    } finally {
      select.disabled = false; addLessonButton.disabled = false;
    }
  });
  $('uploadButton').addEventListener('click', () => $('lessonFile').click());
  $('pasteLessonButton').addEventListener('click', () => {
    $('lessonPasteDialog').showModal();
    $('lessonJsonInput').focus();
  });
  $('cancelPasteButton').addEventListener('click', () => $('lessonPasteDialog').close());
  $('importPasteButton').addEventListener('click', () => {
    try {
      const lesson = importLessonJson($('lessonJsonInput').value);
      $('lessonJsonInput').value = '';
      $('lessonPasteDialog').close();
      notifyLessonImported(lesson);
    } catch (error) {
      notify(error instanceof SyntaxError ? 'Could not read that JSON' : (error.message || 'Could not import lesson'));
    }
  });
  $('lessonFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    try {
      const lesson = importLessonJson(await file.text());
      notifyLessonImported(lesson);
    } catch (err) { notify(err instanceof SyntaxError ? 'Could not read that JSON file' : (err.message || 'Could not import lesson')); }
  });
  $('schemaFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const candidate = parsed.schema || parsed;
      for (const key of ['title', 'steps', 'stepTitle', 'stepContent', 'stepCitations']) if (candidate[key] !== undefined && typeof candidate[key] !== 'string') throw new Error(`Schema field “${key}” must be a dotted path string.`);
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
