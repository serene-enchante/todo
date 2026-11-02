(() => {
  const LESSONS_KEY = 'steps.lessons.v1';
  const SCHEMA_KEY = 'steps.schema.v1';
  const DEFAULT_SCHEMA = { title: 'title', steps: 'steps', stepTitle: 'title', stepContent: 'content' };
  const $ = (id) => document.getElementById(id);
  const library = $('library'), lessonView = $('lessonView');
  let lessons = read(LESSONS_KEY, []), schema = read(SCHEMA_KEY, DEFAULT_SCHEMA);
  let activeId = null, activeStep = 0, toastTimer;

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
