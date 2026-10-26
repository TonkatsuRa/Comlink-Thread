// =============================================================================
// comlink.js — Shadowrun Comlink message-thread builder.
//
// All state lives in the `messages` array (single source of truth): every change
// updates it, persists it to localStorage, then re-renders the thread.
// Depends only on the DOM and localStorage. PDF export uses the browser's native
// print dialog; PNG export uses html2canvas (loaded in comlink.html).
//
// Everything is declared inside ONE DOMContentLoaded handler: declaring the same
// const/function name twice in that scope is a fatal SyntaxError that stops the
// whole script from running.
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------------------
  // DOM references. Cached once at startup; if any of these is null it means
  // comlink.html was changed without updating this script (or vice versa) —
  // we fail loudly below rather than silently doing nothing.
  // ---------------------------------------------------------------------------
  const aliases            = document.querySelector('#alias-select');
  const addUserBtn         = document.querySelector('#add-user-btn');
  const deleteUserBtn      = document.querySelector('#delete-user-btn');
  const userInputElement   = document.querySelector('#alias-input');
  const messageInputElement = document.querySelector('[data-editor]');
  const alignmentSelect    = document.querySelector('#alignment-select');
  const profilePicInput    = document.querySelector('#profile-pic-input');
  const sendMessageBtn     = document.querySelector('#send-message-btn');
  const cancelEditBtn      = document.querySelector('#cancel-edit-btn');
  const clearMessageBtn    = document.querySelector('#clear-message-btn');
  const clearThreadBtn     = document.querySelector('#clear-thread-btn');
  const exportThreadPdfBtn = document.querySelector('#export-thread-pdf-btn');
  const exportThreadPngBtn = document.querySelector('#export-thread-png-btn');
  const threadNameInput    = document.querySelector('#thread-name-input');
  const saveThreadBtn      = document.querySelector('#save-thread-btn');
  const savedThreadsSelect = document.querySelector('#saved-threads-select');
  const loadThreadBtn      = document.querySelector('#load-thread-btn');
  const deleteThreadBtn    = document.querySelector('#delete-thread-btn');
  const statusMessage      = document.querySelector('#status-message');
  const messageCountLabel  = document.querySelector('#message-count');
  const threadContainer    = document.querySelector('.comlink-container');

  const REQUIRED_ELEMENTS = {
    aliases, addUserBtn, deleteUserBtn, userInputElement, messageInputElement,
    alignmentSelect, profilePicInput, sendMessageBtn, cancelEditBtn,
    clearMessageBtn, clearThreadBtn, exportThreadPdfBtn, exportThreadPngBtn,
    threadNameInput, saveThreadBtn, savedThreadsSelect, loadThreadBtn, deleteThreadBtn,
    statusMessage, messageCountLabel, threadContainer,
  };
  for (const [name, el] of Object.entries(REQUIRED_ELEMENTS)) {
    if (!el) {
      // Loud, specific failure instead of a silent no-op: if the HTML markup
      // and this script ever drift apart again, this tells you exactly which
      // element is missing instead of leaving you to guess why nothing works.
      console.error(`[comlink] Missing required DOM element: "${name}". Check comlink.html matches comlink.js.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Persistent state. Everything here is mirrored to localStorage so a page
  // reload doesn't lose the roster or the thread.
  // ---------------------------------------------------------------------------

  /**
   * safeLocalStorageGet
   * Reads and JSON-parses a localStorage key, tolerating a browser/context
   * where localStorage is unavailable (e.g. some browsers restrict it for
   * file:// pages, or private browsing modes).
   * @param {string} key - localStorage key to read.
   * @param {*} fallback - value returned if the key is absent or unreadable.
   * @returns {*} parsed value, or fallback.
   */
  function safeLocalStorageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.error(`[comlink] Failed to read localStorage key "${key}":`, err);
      return fallback;
    }
  }

  /**
   * safeLocalStorageSet
   * Writes a value to localStorage as JSON, tolerating storage failures
   * (quota exceeded, storage disabled, etc.) without crashing the app.
   * @param {string} key - localStorage key to write.
   * @param {*} value - value to serialize and store.
   * @returns {boolean} true on success, false if the write failed.
   */
  function safeLocalStorageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[comlink] Failed to write localStorage key "${key}":`, err);
      setStatus('Warning: could not save to local storage (see console).', true);
      return false;
    }
  }

  /**
   * toThreadMap
   * Builds the saved-threads map as a NULL-PROTOTYPE object. A plain `{}` would
   * treat the key "__proto__" specially (assignment would invoke the inherited
   * setter instead of creating an entry), so a thread with that name would be
   * silently lost. On a null-prototype object every string is an ordinary key.
   * Entries that are not shaped like a saved thread are skipped with a warning.
   * @param {*} source - parsed JSON (expected: plain object of name -> thread).
   * @returns {Object} null-prototype map of name -> {messages, messageIdCounter, savedAt}.
   */
  function toThreadMap(source) {
    const map = Object.create(null);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return map;
    Object.keys(source).forEach((name) => {
      const entry = source[name];
      if (entry && typeof entry === 'object' && Array.isArray(entry.messages)) {
        map[name] = { ...entry, messages: cleanMessages(entry.messages) };
      } else {
        console.warn(`[comlink] Ignoring malformed saved thread "${name}".`);
      }
    });
    return map;
  }

  /**
   * cleanUsers
   * Validates the stored roster. Anything that is not an array of named
   * entries (e.g. the valid-JSON value `null`) falls back to the default
   * roster, and the Admin alias is always present (it is the system sender).
   * @param {*} value - parsed JSON from localStorage (or null).
   * @returns {Array<{name: string, avatarId?: string}>} usable roster.
   */
  function cleanUsers(value) {
    const list = Array.isArray(value)
      ? value.filter((u) => u && typeof u === 'object' && typeof u.name === 'string' && u.name)
      : [];
    if (value !== null && value !== undefined && list.length !== (Array.isArray(value) ? value.length : 0)) {
      console.warn('[comlink] Some stored users were malformed and have been ignored.');
    }
    if (!list.some((u) => u.name === 'Admin')) list.unshift({ name: 'Admin', avatarId: '' });
    return list;
  }

  /**
   * cleanMessages
   * Validates a stored message list: non-arrays become empty, non-object
   * entries are dropped (with a warning), and every kept entry gets the
   * fields the renderer relies on (numeric unique-enough id, string text,
   * left/right alignment). Unknown extra fields are kept as they are.
   * @param {*} value - parsed JSON from localStorage (or null).
   * @returns {Array<Object>} usable message list.
   */
  function cleanMessages(value) {
    if (value !== null && value !== undefined && !Array.isArray(value)) {
      console.warn('[comlink] Stored messages are not a list; starting empty.');
    }
    const list = Array.isArray(value) ? value : [];
    let maxId = list.reduce((max, m) => (m && Number.isFinite(Number(m.id)) && Number(m.id) > max ? Number(m.id) : max), 0);
    const out = [];
    list.forEach((m) => {
      if (!m || typeof m !== 'object') {
        console.warn('[comlink] Ignoring a malformed stored message.');
        return;
      }
      const hasId = m.id !== null && m.id !== undefined && m.id !== '' && Number.isFinite(Number(m.id));
      out.push({
        ...m,
        id: hasId ? Number(m.id) : ++maxId,
        userName: String(m.userName == null ? '' : m.userName),
        rawText: String(m.rawText == null ? '' : m.rawText),
        alignment: m.alignment === 'right' ? 'right' : 'left',
        timestamp: String(m.timestamp == null ? '' : m.timestamp),
      });
    });
    return out;
  }

  // Avatar registry: { [avatarId]: dataURL }. Each distinct profile picture is
  // stored ONCE here; users, messages and saved-thread snapshots only keep the
  // short avatarId. Without this, every message (and every saved copy of it)
  // carried its own full data: URL and localStorage filled up quickly.
  let avatars = safeLocalStorageGet('avatars', {});
  if (!avatars || typeof avatars !== 'object' || Array.isArray(avatars)) avatars = {};
  let lastAvatarsJson = JSON.stringify(avatars); // what is currently persisted (to skip redundant writes)

  let users = cleanUsers(safeLocalStorageGet('users', null));
  let messages = cleanMessages(safeLocalStorageGet('messages', []));
  let messageIdCounter = Number(safeLocalStorageGet('messageIdCounter', 0)) || 0;

  // Named thread saves: { [threadName]: { messages: [...], messageIdCounter: N, savedAt: ISOString } }.
  // Independent of `messages` above, which is always "the thread currently
  // being worked on" -- saving/loading copies data in and out of that
  // working thread, it never aliases it (see saveCurrentThreadAs /
  // loadSavedThread below), so editing after a save/load can't retroactively
  // corrupt a saved snapshot. Null-prototype map: see toThreadMap.
  let savedThreads = toThreadMap(safeLocalStorageGet('savedThreads', {}));

  /**
   * registerAvatar
   * Returns the id of a stored picture, adding it to the registry if new.
   * @param {string} dataUrl - picture as a data: URL ('' for "no picture").
   * @returns {string} avatar id, or '' when there is no picture.
   */
  function registerAvatar(dataUrl) {
    if (!dataUrl) return '';
    const existing = Object.keys(avatars).find((id) => avatars[id] === dataUrl);
    if (existing) return existing;
    let n = 1;
    while (Object.prototype.hasOwnProperty.call(avatars, `av${n}`)) n += 1;
    avatars[`av${n}`] = dataUrl;
    return `av${n}`;
  }

  /**
   * getAvatarURL
   * @param {string} avatarId - id returned by registerAvatar.
   * @returns {string} the data: URL, or '' if the id is empty or unknown.
   */
  function getAvatarURL(avatarId) {
    return avatarId && Object.prototype.hasOwnProperty.call(avatars, avatarId) ? avatars[avatarId] : '';
  }

  /**
   * migrateLegacyAvatars
   * Older versions stored the picture itself on every user (`profilePicture`)
   * and every message (`profilePicURL`). Moves those into the registry and
   * replaces them with `avatarId`, in place.
   * @returns {boolean} true if anything was converted (caller must persist).
   */
  function migrateLegacyAvatars() {
    let changed = false;
    const convert = (item, legacyKey) => {
      if (item && typeof item === 'object' && legacyKey in item) {
        if (!item.avatarId) item.avatarId = registerAvatar(item[legacyKey]);
        delete item[legacyKey];
        changed = true;
      }
    };
    users.forEach((user) => convert(user, 'profilePicture'));
    messages.forEach((m) => convert(m, 'profilePicURL'));
    Object.keys(savedThreads).forEach((name) => savedThreads[name].messages.forEach((m) => convert(m, 'profilePicURL')));
    return changed;
  }

  // Never reuse an id that is already on a message, whatever the stored counter says.
  const maxMessageId = (list) => list.reduce((max, m) => (m && Number(m.id) > max ? Number(m.id) : max), 0);
  messageIdCounter = Math.max(messageIdCounter, maxMessageId(messages));
  const legacyMigrated = migrateLegacyAvatars();

  // Tracks which message is currently being edited (its id), or null when the
  // composer is in "new message" mode.
  let editingMessageId = null;

  // Inline SVG data-URI used as a profile picture when a user has none. Kept
  // as a data: URI (not a remote file) so it never depends on network access
  // and never taints anything if it's ever drawn to a <canvas>.
  const defaultAvatar = `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0" stop-color="#00f7ff"/>
          <stop offset="1" stop-color="#00ff99"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="rgba(0,0,0,0.6)"/>
      <circle cx="60" cy="48" r="22" fill="url(#g)"/>
      <path d="M20 110c6-26 28-38 40-38s34 12 40 38" fill="url(#g)"/>
    </svg>
  `)}`;

  // ---------------------------------------------------------------------------
  // Status bar helper (small feedback line under the composer).
  // ---------------------------------------------------------------------------
  const STATUS_TIMEOUT_MS = 3000;
  const STATUS_ERROR_TIMEOUT_MS = 8000; // errors stay visible longer so they are not missed
  let statusTimeoutHandle;

  /**
   * setStatus
   * Displays a transient feedback message under the composer, auto-clearing
   * after STATUS_TIMEOUT_MS. Used for both success and error feedback so the
   * user always gets visible confirmation of what happened (no silent no-ops).
   * @param {string} message - text to display.
   * @param {boolean} [isError=false] - true to style as an error (reddish).
   * @returns {void}
   */
  function setStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? '#ff6b6b' : 'rgba(255, 255, 255, 0.85)';
    if (statusTimeoutHandle) {
      clearTimeout(statusTimeoutHandle);
    }
    if (message) {
      statusTimeoutHandle = setTimeout(() => {
        statusMessage.textContent = '';
      }, isError ? STATUS_ERROR_TIMEOUT_MS : STATUS_TIMEOUT_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // User (alias) management.
  // ---------------------------------------------------------------------------

  /**
   * getUserByName
   * @param {string} name - alias to look up.
   * @returns {{name: string, avatarId: string}|undefined} matching user, or undefined.
   */
  function getUserByName(name) {
    return users.find((user) => user.name === name);
  }

  /**
   * saveUsers
   * Persists the current `users` array (and the avatar registry it refers to).
   * @returns {boolean} true only if every required write succeeded.
   */
  function saveUsers() {
    return persistAvatars() && safeLocalStorageSet('users', users);
  }

  /**
   * reportSave
   * Shows success feedback only when the write really succeeded; otherwise an
   * explicit error, because the change then exists in memory only and would
   * vanish on reload.
   * @param {boolean} ok - result of a save function.
   * @param {string} successMessage - text shown on success ('' to stay silent).
   * @returns {boolean} ok, unchanged.
   */
  function reportSave(ok, successMessage) {
    if (ok) {
      if (successMessage) setStatus(successMessage);
    } else {
      setStatus('NOT SAVED: browser storage refused the write (full or disabled). This change will be lost on reload.', true);
    }
    return ok;
  }

  /**
   * usedAvatarIds
   * @returns {Set<string>} every avatar id referenced by users, messages or saved threads.
   */
  function usedAvatarIds() {
    const used = new Set();
    users.forEach((user) => user && user.avatarId && used.add(user.avatarId));
    messages.forEach((m) => m && m.avatarId && used.add(m.avatarId));
    Object.keys(savedThreads).forEach((name) => savedThreads[name].messages.forEach((m) => m && m.avatarId && used.add(m.avatarId)));
    return used;
  }

  /**
   * persistAvatars
   * Drops pictures nothing refers to any more, then writes the registry if it
   * changed since the last successful write. Must run BEFORE the data that
   * references the pictures is written, so a failure here leaves old data intact.
   * @returns {boolean} true if the registry is persisted (or already was).
   */
  function persistAvatars() {
    const used = usedAvatarIds();
    Object.keys(avatars).forEach((id) => { if (!used.has(id)) delete avatars[id]; });
    const json = JSON.stringify(avatars);
    if (json === lastAvatarsJson) return true;
    if (!safeLocalStorageSet('avatars', avatars)) return false;
    lastAvatarsJson = json;
    return true;
  }

  /**
   * downscaleImage
   * Shrinks a picture to at most `maxPx` on its longest side (profile pictures
   * are displayed at 75px, so full-size photos only waste storage). On any
   * failure the original is used and the problem is logged.
   * @param {string} dataUrl - source picture as a data: URL.
   * @param {number} maxPx - maximum width/height in pixels.
   * @param {function(string): void} done - called with the resulting data: URL.
   * @returns {void}
   */
  function downscaleImage(dataUrl, maxPx, done) {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        if (scale >= 1) { done(dataUrl); return; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/webp', 0.85)); // falls back to PNG where WebP is unsupported
      } catch (err) {
        console.error('[comlink] Could not downscale profile picture; storing it as is:', err);
        done(dataUrl);
      }
    };
    img.onerror = () => {
      console.error('[comlink] Profile picture could not be decoded; storing it as is.');
      done(dataUrl);
    };
    img.src = dataUrl;
  }

  // Pictures bigger than this (characters of data: URL) are shrunk during migration.
  const AVATAR_COMPACT_THRESHOLD = 20000;

  /**
   * compactAvatars
   * Shrinks oversized pictures in the registry (ids stay the same). Used when
   * migrating data saved by older versions, whose pictures can be full-size
   * photos: writing them as they are would need MORE space than the old data
   * they replace, and fails when storage is nearly full. Calls `done`
   * synchronously when nothing is oversized.
   * @param {function(): void} done - called once every oversized picture was processed.
   * @returns {void}
   */
  function compactAvatars(done) {
    const ids = Object.keys(avatars).filter((id) => avatars[id].length > AVATAR_COMPACT_THRESHOLD);
    if (!ids.length) {
      done();
      return;
    }
    let pending = ids.length;
    ids.forEach((id) => {
      downscaleImage(avatars[id], 150, (small) => {
        if (small.length < avatars[id].length) avatars[id] = small;
        pending -= 1;
        if (pending === 0) done();
      });
    });
  }

  /**
   * updateUserList
   * Rebuilds the <select id="alias-select"> options from the `users` array,
   * preserving the current selection when possible, then refreshes any
   * button states that depend on whether a user is selected.
   * @returns {void}
   */
  function updateUserList() {
    const currentSelection = aliases.value;
    aliases.innerHTML = '<option value="">Select User...</option>';
    users.forEach((user) => {
      const option = document.createElement('option');
      option.value = user.name;
      option.textContent = user.name;
      aliases.appendChild(option);
    });
    if (currentSelection && getUserByName(currentSelection)) {
      aliases.value = currentSelection;
    }
    updateButtonStates();
  }

  /**
   * updateButtonStates
   * Disables the send/update button while no user is selected, since a
   * message cannot be attributed to nobody.
   * @returns {void}
   */
  function updateButtonStates() {
    sendMessageBtn.disabled = !aliases.value;
  }

  addUserBtn.addEventListener('click', () => {
    const userName = userInputElement.value.trim();
    const file = profilePicInput.files[0];

    if (!userName) {
      setStatus('Enter an alias before adding a user.', true);
      return;
    }
    if (getUserByName(userName)) {
      setStatus('That alias already exists.', true);
      return;
    }

    const finishAddUser = (profilePicURL) => {
      // Re-check: another add for the same alias may have completed while the picture was being read.
      if (getUserByName(userName)) {
        setStatus('That alias already exists.', true);
        return;
      }
      users.push({ name: userName, avatarId: registerAvatar(profilePicURL) });
      if (!reportSave(saveUsers(), `Added ${userName} to the roster.`)) {
        users.pop(); // roll back: a user that would vanish on reload is worse than a refused add
        return;
      }
      updateUserList();
      userInputElement.value = '';
      profilePicInput.value = '';
    };

    if (file) {
      const reader = new FileReader();
      // `load` (not `loadend`): loadend also fires after a failed read, which would add the user without a picture.
      reader.onload = () => downscaleImage(reader.result, 150, finishAddUser);
      reader.onerror = () => {
        console.error('[comlink] Failed to read profile picture file:', reader.error);
        setStatus('Could not read that image file.', true);
      };
      reader.readAsDataURL(file);
    } else {
      finishAddUser('');
    }
  });

  deleteUserBtn.addEventListener('click', () => {
    const userName = aliases.value;
    if (userName === 'Admin') {
      setStatus('Admin cannot be removed.', true);
      return;
    }
    const userIndex = users.findIndex((user) => user.name === userName);
    if (userIndex === -1) {
      setStatus('Select a user to delete.', true);
      return;
    }
    users.splice(userIndex, 1);
    updateUserList();
    reportSave(saveUsers(), `Removed ${userName} from the roster.`);
  });

  aliases.addEventListener('change', updateButtonStates);

  // ---------------------------------------------------------------------------
  // BBCode -> HTML conversion for message bodies.
  // ---------------------------------------------------------------------------

  /**
   * escapeForHtml
   * Escapes the characters that matter in HTML text AND double/single-quoted
   * attribute values, so text cannot break out of either.
   * @param {string} text - raw text.
   * @returns {string} escaped text.
   */
  function escapeForHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * bbCodeToHTML
   * Converts a small, fixed set of BBCode tags to HTML for display.
   * Raw HTML typed in a message is escaped FIRST (it is shown as text, never
   * interpreted), and the tag arguments that end up in attributes are checked:
   * links and images only accept http(s) (images also data:image), colours and
   * sizes only plain values. A tag with an unacceptable argument is left as
   * visible text instead of being converted. The returned string is therefore
   * safe to put into the page (see setRichContent).
   * @param {string} text - raw BBCode text as typed in the composer.
   * @returns {string} escaped HTML string; insert it with setRichContent.
   */
  function bbCodeToHTML(text) {
    const SAFE_LINK = /^https?:\/\/[^\s]+$/i;
    const SAFE_IMAGE = /^(https?:\/\/[^\s]+|data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+)$/i;
    const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
    const SAFE_SIZE = /^\d{1,3}$/;
    // Returns `html` when `value` passes `pattern`, otherwise the original (already escaped) tag text.
    const guarded = (pattern, value, html, original) => (pattern.test(value) ? html : original);

    const bbCodes = [
      { regex: /\[b\](.*?)\[\/b\]/g, replacement: '<strong>$1</strong>' },
      { regex: /\[i\](.*?)\[\/i\]/g, replacement: '<em>$1</em>' },
      { regex: /\[u\](.*?)\[\/u\]/g, replacement: '<u>$1</u>' },
      { regex: /\[s\](.*?)\[\/s\]/g, replacement: '<strike>$1</strike>' },
      { regex: /\[left\](.*?)\[\/left\]/g, replacement: '<div style="text-align: left">$1</div>' },
      { regex: /\[center\](.*?)\[\/center\]/g, replacement: '<div style="text-align: center">$1</div>' },
      { regex: /\[right\](.*?)\[\/right\]/g, replacement: '<div style="text-align: right">$1</div>' },
      { regex: /\[color=(.*?)\](.*?)\[\/color\]/g, replacement: (m, c, t) => guarded(SAFE_COLOR, c, `<span style="color:${c}">${t}</span>`, m) },
      { regex: /\[size=(.*?)\](.*?)\[\/size\]/g, replacement: (m, n, t) => guarded(SAFE_SIZE, n, `<span style="font-size:${n}px">${t}</span>`, m) },
      { regex: /\[url\](.*?)\[\/url\]/g, replacement: (m, u) => guarded(SAFE_LINK, u, `<a href="${u}" target="_blank" rel="noopener">${u}</a>`, m) },
      { regex: /\[url=(.*?)\](.*?)\[\/url\]/g, replacement: (m, u, t) => guarded(SAFE_LINK, u, `<a href="${u}" target="_blank" rel="noopener">${t}</a>`, m) },
      { regex: /\[img\](.*?)\[\/img\]/g, replacement: (m, u) => guarded(SAFE_IMAGE, u, `<img src="${u}" alt="Image" />`, m) },
      { regex: /\[quote\](.*?)\[\/quote\]/g, replacement: '<blockquote>$1</blockquote>' },
      { regex: /\[list\](.*?)\[\/list\]/g, replacement: '<ul>$1</ul>' },
      { regex: /\[\*\](.*?)\[\/\*\]/g, replacement: '<li>$1</li>' },
    ];
    return bbCodes.reduce((acc, bbCode) => acc.replace(bbCode.regex, bbCode.replacement), escapeForHtml(text));
  }

  /**
   * setRichContent
   * Puts the result of bbCodeToHTML into an element WITHOUT assigning to
   * innerHTML: the string is parsed by DOMParser into an inert document (no
   * script runs, no image loads there), a last defensive pass removes
   * script-like elements and any event-handler / javascript: attribute, and
   * only then are the nodes moved into the page.
   * @param {HTMLElement} element - element whose content is replaced.
   * @param {string} html - output of bbCodeToHTML.
   * @returns {void}
   */
  function setRichContent(element, html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.body.querySelectorAll('script, iframe, object, embed, style, link, meta, base, form').forEach((node) => node.remove());
    parsed.body.querySelectorAll('*').forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        const value = attr.value.trim().toLowerCase();
        if (attr.name.toLowerCase().startsWith('on') || value.startsWith('javascript:')) node.removeAttribute(attr.name);
      });
    });
    element.replaceChildren(...Array.from(parsed.body.childNodes).map((node) => document.importNode(node, true)));
  }

  // ---------------------------------------------------------------------------
  // Message persistence + rendering.
  //
  // Design choice: the `messages` array in memory is the single source of
  // truth. Any mutation (send, edit, delete, reorder, clear) updates that
  // array, persists it, then calls renderThread() to rebuild the DOM from
  // scratch. This is simpler and less bug-prone than patching DOM nodes in
  // place. Thread sizes for a tabletop session are small (dozens of
  // messages), so a full re-render on every change has no perceptible cost.
  // ---------------------------------------------------------------------------

  /**
   * saveMessages
   * Persists `messages` and `messageIdCounter` to localStorage, and refreshes
   * the visible message counter in the sidebar.
   * @returns {boolean} true only if every required write succeeded.
   */
  function saveMessages() {
    messageCountLabel.textContent = String(messages.length);
    // The counter is also re-derived from the highest message id on load, so a
    // failed counter write alone is harmless; the messages write is what matters.
    const ok = persistAvatars() && safeLocalStorageSet('messages', messages);
    safeLocalStorageSet('messageIdCounter', messageIdCounter);
    return ok;
  }

  /**
   * nextMessageId
   * Allocates a message id. Another tab may have handed out ids since this
   * page loaded, so the persisted counter is consulted before incrementing.
   * @returns {number} an id not used by any message or previously allocated.
   */
  function nextMessageId() {
    const stored = Number(safeLocalStorageGet('messageIdCounter', 0)) || 0;
    messageIdCounter = Math.max(messageIdCounter, stored, maxMessageId(messages)) + 1;
    return messageIdCounter;
  }

  // ---------------------------------------------------------------------------
  // Named thread saves (save the current working thread under a name, load a
  // saved one back, delete one). This is separate from the plain
  // save/restore-on-reload behaviour above: that always persists whatever is
  // currently being worked on; this lets the user keep several distinct
  // threads (e.g. one per session) and switch between them.
  // ---------------------------------------------------------------------------

  /**
   * saveSavedThreads
   * Persists the `savedThreads` map (and the avatar registry it refers to).
   * @returns {boolean} true only if every required write succeeded.
   */
  function saveSavedThreads() {
    return persistAvatars() && safeLocalStorageSet('savedThreads', savedThreads);
  }

  /**
   * updateSavedThreadsList
   * Rebuilds the <select id="saved-threads-select"> options from
   * `savedThreads`, preserving the current selection when possible.
   * @returns {void}
   */
  function updateSavedThreadsList() {
    const currentSelection = savedThreadsSelect.value;
    savedThreadsSelect.innerHTML = '<option value="">Select saved thread...</option>';
    Object.keys(savedThreads).sort((a, b) => a.localeCompare(b)).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      savedThreadsSelect.appendChild(option);
    });
    if (currentSelection && Object.prototype.hasOwnProperty.call(savedThreads, currentSelection)) {
      savedThreadsSelect.value = currentSelection;
    }
  }

  /**
   * saveCurrentThreadAs
   * Snapshots the current working thread (`messages` + `messageIdCounter`)
   * under the given name, overwriting any existing save of that name after
   * confirmation. Stores a deep copy so later edits to the working thread
   * never retroactively change the saved snapshot.
   * @param {string} name - name to save under (trimmed, must be non-empty).
   * @returns {void}
   */
  function saveCurrentThreadAs(name) {
    if (!name) {
      setStatus('Enter a name for this thread before saving.', true);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(savedThreads, name)) {
      if (!window.confirm(`A saved thread named "${name}" already exists. Overwrite it?`)) {
        return;
      }
    }
    const hadPrevious = Object.prototype.hasOwnProperty.call(savedThreads, name);
    const previous = savedThreads[name];
    savedThreads[name] = {
      messages: JSON.parse(JSON.stringify(messages)),
      messageIdCounter,
      savedAt: new Date().toISOString(),
    };
    if (!saveSavedThreads()) {
      // Roll back so the list never shows a save that would vanish on reload.
      if (hadPrevious) savedThreads[name] = previous; else delete savedThreads[name];
      reportSave(false);
      return;
    }
    updateSavedThreadsList();
    savedThreadsSelect.value = name;
    threadNameInput.value = '';
    setStatus(`Thread saved as "${name}".`);
  }

  /**
   * loadSavedThread
   * Replaces the current working thread with a deep copy of a saved one.
   * Warns before discarding an unsaved, non-empty working thread.
   * @param {string} name - name of the saved thread to load.
   * @returns {void}
   */
  function loadSavedThread(name) {
    if (!name || !Object.prototype.hasOwnProperty.call(savedThreads, name)) {
      setStatus('Select a saved thread to load.', true);
      return;
    }
    if (messages.length && !window.confirm('Loading will replace the current thread. Any unsaved changes to it will be lost. Continue?')) {
      return;
    }
    const saved = savedThreads[name];
    messages = JSON.parse(JSON.stringify(saved.messages));
    messageIdCounter = Math.max(Number(saved.messageIdCounter) || 0, maxMessageId(messages));
    if (editingMessageId !== null) cancelEdit(true);
    const persisted = saveMessages();
    renderThread();
    reportSave(persisted, `Loaded "${name}".`);
  }

  /**
   * deleteSavedThread
   * Removes a named save from `savedThreads` after confirmation. Does not
   * touch the current working thread.
   * @param {string} name - name of the saved thread to delete.
   * @returns {void}
   */
  function deleteSavedThread(name) {
    if (!name || !Object.prototype.hasOwnProperty.call(savedThreads, name)) {
      setStatus('Select a saved thread to delete.', true);
      return;
    }
    if (!window.confirm(`Delete the saved thread "${name}"? This cannot be undone.`)) {
      return;
    }
    delete savedThreads[name];
    updateSavedThreadsList();
    reportSave(saveSavedThreads(), `Deleted "${name}".`);
  }

  saveThreadBtn.addEventListener('click', () => saveCurrentThreadAs(threadNameInput.value.trim()));
  loadThreadBtn.addEventListener('click', () => loadSavedThread(savedThreadsSelect.value));
  deleteThreadBtn.addEventListener('click', () => deleteSavedThread(savedThreadsSelect.value));

  /**
   * buildMessageElement
   * Builds (but does not insert) the DOM subtree for a single message.
   * @param {{id:number, userName:string, avatarId:string, rawText:string, alignment:string, timestamp:string}} messageData
   * @returns {HTMLElement} the root `.message` element, ready to be appended.
   */
  function buildMessageElement({ id, userName, avatarId, rawText, alignment, timestamp }) {
    const isAdmin = userName === 'Admin';
    const renderedHTML = bbCodeToHTML(rawText);

    const message = document.createElement('div');
    message.classList.add('message', `message-${alignment}`);
    message.dataset.messageId = String(id);

    const messageBox = document.createElement('div');
    messageBox.classList.add('message-box');

    const profilePic = document.createElement('img');
    profilePic.classList.add('profile-pic');
    profilePic.src = getAvatarURL(avatarId) || defaultAvatar;
    profilePic.style.width = '75px';
    profilePic.style.height = '75px';

    // Per-message action buttons: reorder, edit, PDF export, delete.
    const arrowContainer = document.createElement('div');
    arrowContainer.classList.add('arrow-container', `arrow-container-${alignment}`);

    const moveUpBtn = document.createElement('button');
    moveUpBtn.classList.add('move-up-btn');
    moveUpBtn.textContent = '↑';
    moveUpBtn.title = 'Move up';
    moveUpBtn.onclick = () => moveMessage(id, -1);

    const moveDownBtn = document.createElement('button');
    moveDownBtn.classList.add('move-down-btn');
    moveDownBtn.textContent = '↓';
    moveDownBtn.title = 'Move down';
    moveDownBtn.onclick = () => moveMessage(id, 1);

    const editBtn = document.createElement('button');
    editBtn.classList.add('edit-btn');
    editBtn.textContent = '✎';
    editBtn.title = 'Edit message';
    editBtn.onclick = () => beginEditMessage(id);

    const pdfBtn = document.createElement('button');
    pdfBtn.classList.add('pdf-btn');
    pdfBtn.textContent = 'PDF';
    pdfBtn.title = 'Export this message as PDF';
    pdfBtn.onclick = () => exportMessageToPdf(message);

    const pngBtn = document.createElement('button');
    pngBtn.classList.add('png-btn');
    pngBtn.textContent = 'PNG';
    pngBtn.title = 'Export this message as a PNG image';
    pngBtn.onclick = () => exportMessageToPng(id);

    arrowContainer.appendChild(moveUpBtn);
    arrowContainer.appendChild(moveDownBtn);
    arrowContainer.appendChild(editBtn);
    arrowContainer.appendChild(pdfBtn);
    arrowContainer.appendChild(pngBtn);

    if (alignment === 'left') {
      messageBox.appendChild(arrowContainer);
      if (!isAdmin) messageBox.appendChild(profilePic);
    }

    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    if (alignment === 'left') messageContent.setAttribute('data-augmented-ui', 'bl-clip tr-2-clip-x');
    if (alignment === 'right') messageContent.setAttribute('data-augmented-ui', 'br-clip tl-2-clip-x');

    if (!isAdmin) {
      const messageInfo = document.createElement('div');
      messageInfo.classList.add('message-info');

      const userNameSpan = document.createElement('span');
      userNameSpan.classList.add('name');
      userNameSpan.textContent = userName;

      const timestampSpan = document.createElement('span');
      timestampSpan.classList.add('timestamp');
      timestampSpan.textContent = timestamp || new Date().toLocaleTimeString();

      const messageTextP = document.createElement('p');
      setRichContent(messageTextP, renderedHTML);

      messageInfo.appendChild(userNameSpan);
      messageInfo.appendChild(timestampSpan);
      messageContent.appendChild(messageInfo);
      messageContent.appendChild(messageTextP);
    } else {
      messageContent.style.background = 'transparent';
      messageContent.style.border = 'none';
      messageContent.style.boxShadow = 'none';
      messageContent.style.outline = 'none';
      messageContent.style.borderColor = 'transparent';
      messageContent.style.color = '#000';
      messageContent.setAttribute('data-augmented-ui', 'none');
      setRichContent(messageContent, renderedHTML);
      message.classList.add('admin-message');
      messageContent.classList.add('admin-message-content');
    }

    messageBox.appendChild(messageContent);

    if (alignment === 'right') {
      if (!isAdmin) messageBox.appendChild(profilePic);
      messageBox.appendChild(arrowContainer);
    }

    message.appendChild(messageBox);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.textContent = 'x';
    deleteBtn.title = 'Delete message';
    deleteBtn.onclick = () => deleteMessage(id);
    messageBox.appendChild(deleteBtn);

    return message;
  }

  /**
   * renderThread
   * Clears and rebuilds the visible message thread from the `messages` array.
   * Source of truth is always the array; the DOM is a disposable projection
   * of it, which avoids the array/DOM desync bugs that affected the previous
   * in-place-DOM-surgery version of move up/down.
   * @returns {void}
   */
  function renderThread() {
    threadContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    messages.forEach((messageData) => fragment.appendChild(buildMessageElement(messageData)));
    threadContainer.appendChild(fragment);
  }

  /**
   * deleteMessage
   * Removes a message by id, persists, and re-renders.
   * @param {number} id - id of the message to remove.
   * @returns {void}
   */
  function deleteMessage(id) {
    messages = messages.filter((item) => item.id !== id);
    const saved = saveMessages();
    renderThread();
    reportSave(saved, 'Message removed.');
    if (editingMessageId === id) cancelEdit(true);
  }

  /**
   * moveMessage
   * Swaps a message with its neighbour in the given direction, persists, and
   * re-renders. No-op (silently, deliberately) if already at the boundary.
   * @param {number} id - id of the message to move.
   * @param {number} direction - -1 to move up/earlier, +1 to move down/later.
   * @returns {void}
   */
  function moveMessage(id, direction) {
    const index = messages.findIndex((item) => item.id === id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= messages.length) {
      return;
    }
    const [moved] = messages.splice(index, 1);
    messages.splice(targetIndex, 0, moved);
    const saved = saveMessages();
    renderThread();
    if (!saved) reportSave(false);
  }

  // ---------------------------------------------------------------------------
  // Composer: send / edit / cancel-edit / clear draft / clear thread.
  // ---------------------------------------------------------------------------

  /**
   * beginEditMessage
   * Switches the composer into "edit" mode for an existing message: loads its
   * alias, alignment and raw text back into the form controls, and swaps the
   * Send button for an "Update Message" label with a visible Cancel button.
   * @param {number} id - id of the message to edit.
   * @returns {void}
   */
  function beginEditMessage(id) {
    const target = messages.find((item) => item.id === id);
    if (!target) {
      console.error(`[comlink] beginEditMessage: no message with id ${id}`);
      setStatus('Could not find that message to edit.', true);
      return;
    }
    editingMessageId = id;
    if (!getUserByName(target.userName)) {
      // The author was removed from the roster: offer the stored alias for this edit only,
      // so the message stays editable (it keeps its alias and picture).
      const orphan = document.createElement('option');
      orphan.value = target.userName;
      orphan.textContent = `${target.userName} (removed from roster)`;
      aliases.appendChild(orphan);
    }
    aliases.value = target.userName;
    alignmentSelect.value = target.alignment;
    messageInputElement.value = target.rawText;
    updateButtonStates();
    sendMessageBtn.textContent = 'Update Message';
    cancelEditBtn.style.display = '';
    messageInputElement.focus();
    setStatus('Editing message — make your changes and click "Update Message".');
  }

  /**
   * cancelEdit
   * Leaves edit mode without saving changes, restoring the composer to its
   * normal "new message" state.
   * @param {boolean} [silent=false] - true when the caller already set its own status (edit saved,
   *   message deleted...), so "Edit cancelled." must not replace it.
   * @returns {void}
   */
  function cancelEdit(silent = false) {
    editingMessageId = null;
    messageInputElement.value = '';
    sendMessageBtn.textContent = 'Send Message';
    cancelEditBtn.style.display = 'none';
    updateUserList(); // drops the temporary option added for a removed user (see beginEditMessage)
    if (!silent) setStatus('Edit cancelled.');
  }

  cancelEditBtn.addEventListener('click', () => cancelEdit(false));

  sendMessageBtn.addEventListener('click', () => {
    const userName = aliases.value;
    let user = getUserByName(userName);
    if (!user && editingMessageId !== null) {
      // Editing a message whose author left the roster: keep the stored alias and picture.
      const original = messages.find((item) => item.id === editingMessageId);
      if (original && original.userName === userName) user = { name: userName, avatarId: original.avatarId || '' };
    }
    if (!user) {
      setStatus('Select a user before sending a message.', true);
      return;
    }

    const rawMessageText = messageInputElement.value.trim();
    if (!rawMessageText) {
      setStatus('Draft is empty.', true);
      return;
    }

    const alignment = alignmentSelect.value;

    if (editingMessageId !== null) {
      // Update the existing message in place, keeping its id/position/timestamp.
      const target = messages.find((item) => item.id === editingMessageId);
      if (!target) {
        console.error(`[comlink] Send handler: message ${editingMessageId} vanished during edit.`);
        setStatus('That message no longer exists; edit cancelled.', true);
        cancelEdit(true);
        return;
      }
      target.userName = userName;
      target.avatarId = user.avatarId || '';
      delete target.profilePicURL; // legacy field, superseded by avatarId
      target.rawText = rawMessageText;
      target.alignment = alignment;
      const saved = saveMessages();
      renderThread();
      reportSave(saved, 'Message updated.');
      cancelEdit(true);
    } else {
      // Create a new message.
      const newMessage = {
        id: nextMessageId(),
        userName,
        avatarId: user.avatarId || '',
        rawText: rawMessageText,
        alignment,
        timestamp: new Date().toLocaleTimeString(),
      };
      messages.push(newMessage);
      const saved = saveMessages();
      renderThread();
      messageInputElement.value = '';
      reportSave(saved, 'Message sent.');
    }
  });

  clearMessageBtn.addEventListener('click', () => {
    messageInputElement.value = '';
    if (editingMessageId !== null) cancelEdit(true);
    setStatus('Draft cleared.');
  });

  clearThreadBtn.addEventListener('click', () => {
    if (!messages.length) {
      setStatus('Thread is already empty.', true);
      return;
    }
    if (!window.confirm('Clear the entire message thread? This cannot be undone.')) {
      return;
    }
    messages = [];
    const saved = saveMessages();
    renderThread();
    if (editingMessageId !== null) cancelEdit(true);
    reportSave(saved, 'Thread cleared.');
  });

  // Ctrl+Enter (or Cmd+Enter on Mac) sends/updates from inside the textarea.
  messageInputElement.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      sendMessageBtn.click();
    }
  });

  // ---------------------------------------------------------------------------
  // PDF export (single message or whole thread) via the browser's native print
  // dialog.
  //
  // Rationale: no third-party library is needed for PDF. The native print
  // pipeline renders the exact same CSS as the screen (clip-path corners from
  // augmented-ui, backdrop-filter and the scanline mask, which canvas
  // rasterizers render imperfectly) and works in every modern browser. The user
  // picks "Save as PDF" as the destination in the print dialog.
  // ---------------------------------------------------------------------------

  const PRINT_TARGET_CLASS = 'print-target';

  /**
   * exportElementToPdf
   * Marks an arbitrary element for printing, opens the browser's print
   * dialog (where the user picks "Save as PDF" as the destination), then
   * cleans up the marker afterwards. Shared by both the per-message "PDF"
   * button and the "Thread -> PDF" button: the print stylesheet (see
   * comlink.css) hides everything except .print-target and its descendants,
   * regardless of whether that's a single .message or the whole
   * .comlink-container.
   * @param {HTMLElement} element - element to print (a `.message`, or the whole thread container).
   * @returns {void}
   */
  function exportElementToPdf(element) {
    if (!element || !element.isConnected) {
      console.error('[comlink] exportElementToPdf: target element is missing or detached.');
      setStatus('Could not export (internal error, see console).', true);
      return;
    }

    element.classList.add(PRINT_TARGET_CLASS);
    // For a single message, its container also gets a marker so the print
    // stylesheet can drop the other messages and the container's own box.
    const container = element.closest('.comlink-container');
    const singleMessage = container && container !== element ? container : null;
    if (singleMessage) singleMessage.classList.add('print-single');

    // afterprint fires once the print dialog is dismissed (Chrome, Firefox,
    // Edge all support it). Some older/other browsers may not fire it
    // reliably, so a timeout fallback guarantees the marker is always
    // removed rather than leaving the page stuck in "print mode".
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      element.classList.remove(PRINT_TARGET_CLASS);
      if (singleMessage) singleMessage.classList.remove('print-single');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      if (!cleaned) {
        console.warn('[comlink] exportElementToPdf: "afterprint" event never fired, cleaning up via fallback timeout.');
        cleanup();
      }
    }, 15000);

    try {
      window.print();
    } catch (err) {
      console.error('[comlink] window.print() failed:', err);
      setStatus('Printing failed (see console for details).', true);
      cleanup();
    }
  }

  /**
   * exportMessageToPdf
   * PDF export for a single message (wraps exportElementToPdf).
   * @param {HTMLElement} messageElement - the `.message` root element to export.
   * @returns {void}
   */
  function exportMessageToPdf(messageElement) {
    exportElementToPdf(messageElement);
  }

  /**
   * exportThreadToPdf
   * PDF export for the entire visible thread (wraps exportElementToPdf).
   * Multi-message threads will span multiple pages automatically; the
   * browser's print dialog lets the user pick page size/orientation.
   * @returns {void}
   */
  function exportThreadToPdf() {
    if (!messages.length) {
      setStatus('Thread is empty, nothing to export.', true);
      return;
    }
    exportElementToPdf(threadContainer);
  }

  // ---------------------------------------------------------------------------
  // PNG export via html2canvas.
  //
  // Rasterizing the live, augmented-ui styled DOM directly does not work with
  // html2canvas: it ignores clip-path (the border pseudo-elements get painted as
  // solid blocks over the text) and renders linear-gradient backgrounds and
  // backdrop-filter incorrectly. So the export rebuilds a deliberately PLAIN DOM
  // subtree from the message data (see buildExportSnapshot) using only features
  // html2canvas renders reliably: solid colours, plain borders, flexbox, simple
  // inline tags. The image is less fancy than the live UI (square corners, no
  // glass blur) but reliably legible, which matters more for a handout.
  // ---------------------------------------------------------------------------

  const EXPORT_SNAPSHOT_BG = '#141d1b';

  /**
   * buildExportSnapshot
   * Builds a detached, plain-CSS-only DOM subtree representing one or more
   * messages, suitable for html2canvas. Not inserted into the document by
   * this function -- the caller is responsible for attaching it (off-screen)
   * before capture and removing it afterwards.
   * @param {Array<{id:number, userName:string, avatarId:string, rawText:string, alignment:string, timestamp:string}>} messageList
   * @returns {HTMLElement} the wrapper element containing one row per message.
   */
  function buildExportSnapshot(messageList) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
      'width:820px',
      'padding:24px',
      'box-sizing:border-box',
      `background-color:${EXPORT_SNAPSHOT_BG}`,
      'font-family:"IBM Plex Mono", monospace',
      'color:#fff',
    ].join(';');

    messageList.forEach((m) => {
      const isAdmin = m.userName === 'Admin';
      const isRight = m.alignment === 'right';

      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex',
        'align-items:flex-end',
        'margin-bottom:16px',
        isRight ? 'justify-content:flex-end' : 'justify-content:flex-start',
      ].join(';');

      const avatar = document.createElement('img');
      avatar.src = getAvatarURL(m.avatarId) || defaultAvatar;
      avatar.style.cssText = [
        'width:64px', 'height:64px', 'object-fit:cover',
        'border-radius:4px', 'border:2px solid #3FCBFF', 'flex-shrink:0',
      ].join(';');

      const bubble = document.createElement('div');
      const bubbleBg = isAdmin ? 'transparent' : (isRight ? 'rgba(255,165,0,0.35)' : 'rgba(255,0,0,0.35)');
      bubble.style.cssText = [
        'max-width:520px', 'min-width:220px', 'margin:0 12px',
        'padding:10px 14px', 'border:1px solid #3FCBFF',
        `background-color:${bubbleBg}`,
        `color:${isAdmin ? '#33ff55' : '#fff'}`,
        'word-wrap:break-word',
      ].join(';');

      if (!isAdmin) {
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;gap:16px;font-size:12px;color:#FFFF00;margin-bottom:4px;';
        // Built with textContent, never parsed as markup.
        const nameSpan = document.createElement('span');
        nameSpan.textContent = m.userName;
        const timeSpan = document.createElement('span');
        timeSpan.textContent = m.timestamp || '';
        header.append(nameSpan, timeSpan);
        bubble.appendChild(header);
      }

      const body = document.createElement('div');
      setRichContent(body, bbCodeToHTML(m.rawText));
      bubble.appendChild(body);

      if (isRight) {
        row.appendChild(bubble);
        if (!isAdmin) row.appendChild(avatar);
      } else {
        if (!isAdmin) row.appendChild(avatar);
        row.appendChild(bubble);
      }

      wrapper.appendChild(row);
    });

    return wrapper;
  }

  /**
   * renderMessagesToPng
   * Builds a plain export snapshot for the given messages, rasterizes it
   * with html2canvas, and triggers a browser download of the resulting PNG.
   * @param {Array<Object>} messageList - message objects to render (see buildExportSnapshot).
   * @param {string} filenameBase - filename (without extension) for the downloaded PNG.
   * @returns {void}
   */
  function renderMessagesToPng(messageList, filenameBase) {
    if (typeof window.html2canvas !== 'function') {
      // Expected failure mode if lib/html2canvas.min.js is missing (incomplete
      // copy of the project) or blocked by the browser.
      console.error('[comlink] renderMessagesToPng: html2canvas is not available. Check that lib/html2canvas.min.js exists next to comlink.html and loaded (open the browser Network tab).');
      setStatus('PNG export unavailable: lib/html2canvas.min.js failed to load (is the lib folder next to comlink.html?).', true);
      return;
    }
    if (!messageList.length) {
      setStatus('Nothing to export.', true);
      return;
    }

    const snapshot = buildExportSnapshot(messageList);
    // Positioned off-screen rather than display:none: html2canvas needs the
    // element to actually be laid out (real dimensions) to capture it.
    snapshot.style.position = 'fixed';
    snapshot.style.left = '-99999px';
    snapshot.style.top = '0';
    document.body.appendChild(snapshot);
    setStatus('Rendering PNG…');

    const startRender = (skippedImages) => window.html2canvas(snapshot, {
      backgroundColor: EXPORT_SNAPSHOT_BG,
      useCORS: true, // harmless here since avatars are always data: URIs, kept for safety
      scale: window.devicePixelRatio || 1, // sharper output on high-DPI screens
    }).then((canvas) => {
      snapshot.remove();
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch (err) {
        // Most likely a tainted-canvas SecurityError -- would only happen if
        // a message's [img] BBCode tag pointed at a cross-origin image
        // without CORS headers (avatars themselves are always data: URIs).
        console.error('[comlink] renderMessagesToPng: canvas.toDataURL failed (possibly a tainted canvas from a cross-origin [img] tag):', err);
        setStatus('PNG export failed: could not read the rendered image (see console).', true);
        return;
      }
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${filenameBase}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus(skippedImages
        ? `PNG downloaded, but ${skippedImages} remote image(s) could not be included (their host does not allow it).`
        : 'PNG downloaded.', skippedImages > 0);
    }).catch((err) => {
      snapshot.remove();
      console.error('[comlink] renderMessagesToPng: html2canvas rendering failed:', err);
      setStatus('PNG export failed (see console for details).', true);
    });

    prepareRemoteImages(snapshot, startRender);
  }

  /**
   * prepareRemoteImages
   * html2canvas can only draw a remote image if its host allows cross-origin
   * use (CORS); otherwise the image is silently missing or the canvas becomes
   * unreadable. Each non-data: image of the snapshot is probed first; the ones
   * that cannot be loaded that way are replaced by a visible placeholder, and
   * the caller is told how many were skipped so the user is not misled.
   * Calls `done` synchronously when there is nothing remote to check.
   * @param {HTMLElement} root - export snapshot element.
   * @param {function(number): void} done - receives the number of images replaced.
   * @returns {void}
   */
  function prepareRemoteImages(root, done) {
    const remote = [...root.querySelectorAll('img')].filter((img) => !/^data:/i.test(img.getAttribute('src') || ''));
    if (!remote.length) {
      done(0);
      return;
    }
    let pending = remote.length;
    let skipped = 0;
    remote.forEach((img) => {
      const probe = new Image();
      let finished = false;
      const finish = (ok) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (!ok) {
          skipped += 1;
          console.warn('[comlink] PNG export: remote image cannot be used cross-origin, replaced by a placeholder:', img.getAttribute('src'));
          const note = document.createElement('span');
          note.textContent = '[image not exported]';
          img.replaceWith(note);
        }
        pending -= 1;
        if (pending === 0) done(skipped);
      };
      const timer = setTimeout(() => finish(false), 10000);
      probe.onload = () => finish(true);
      probe.onerror = () => finish(false);
      probe.crossOrigin = 'anonymous';
      probe.src = img.getAttribute('src');
    });
  }

  /**
   * exportMessageToPng
   * PNG export for a single message, by id.
   * @param {number} id - id of the message to export.
   * @returns {void}
   */
  function exportMessageToPng(id) {
    const target = messages.find((item) => item.id === id);
    if (!target) {
      console.error(`[comlink] exportMessageToPng: no message with id ${id}`);
      setStatus('Could not find that message to export.', true);
      return;
    }
    renderMessagesToPng([target], `comlink-message-${id}`);
  }

  /**
   * exportThreadToPng
   * PNG export for the entire thread, in current order.
   * @returns {void}
   */
  function exportThreadToPng() {
    renderMessagesToPng(messages, 'comlink-thread');
  }

  exportThreadPdfBtn.addEventListener('click', exportThreadToPdf);
  exportThreadPngBtn.addEventListener('click', exportThreadToPng);

  // ---------------------------------------------------------------------------
  // Startup.
  // ---------------------------------------------------------------------------

  /**
   * applyExternalChange
   * Reloads in-memory state after ANOTHER tab changed localStorage, so this tab
   * never later overwrites those changes with its own stale copy. (The
   * `storage` event is only delivered to other tabs, never to the writer.)
   * @param {string|null} key - changed key; null means storage was cleared.
   * @returns {void}
   */
  function applyExternalChange(key) {
    const all = key === null;
    if (all || key === 'avatars') {
      avatars = safeLocalStorageGet('avatars', {});
      if (!avatars || typeof avatars !== 'object' || Array.isArray(avatars)) avatars = {};
      lastAvatarsJson = JSON.stringify(avatars);
    }
    if (all || key === 'users') {
      users = cleanUsers(safeLocalStorageGet('users', null));
      updateUserList();
    }
    if (all || key === 'savedThreads') {
      savedThreads = toThreadMap(safeLocalStorageGet('savedThreads', {}));
      updateSavedThreadsList();
    }
    if (all || key === 'messages' || key === 'messageIdCounter') {
      messages = cleanMessages(safeLocalStorageGet('messages', []));
      messageIdCounter = Math.max(messageIdCounter, Number(safeLocalStorageGet('messageIdCounter', 0)) || 0, maxMessageId(messages));
      messageCountLabel.textContent = String(messages.length);
      renderThread();
      if (editingMessageId !== null && !messages.some((m) => m.id === editingMessageId)) {
        setStatus('The message you were editing was removed in another tab; edit cancelled.', true);
        cancelEdit(true);
      }
    }
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== null && !['avatars', 'users', 'messages', 'messageIdCounter', 'savedThreads'].includes(event.key)) return;
    console.info(`[comlink] Storage changed in another tab (${event.key === null ? 'cleared' : event.key}); reloading.`);
    applyExternalChange(event.key);
  });

  updateUserList();
  updateSavedThreadsList();
  renderThread();
  const finishStartup = () => {
    if (legacyMigrated) {
      // Persist the converted data. The registry is written first (inside the
      // save functions), so if storage refuses it the old data stays untouched.
      console.info('[comlink] Migrating profile pictures to the shared avatar registry.');
      if (reportSave(saveUsers() && saveSavedThreads(), '')) {
        updateUserList();
        renderThread();
      } else {
        console.error('[comlink] Migration could not be saved: browser storage is full. Your previous data is still stored unchanged.');
        messageCountLabel.textContent = String(messages.length);
        return; // keep the "NOT SAVED" status visible; nothing more is written
      }
    }
    saveMessages(); // ensures the message counter reflects loaded data immediately
  };
  // Legacy pictures are shrunk BEFORE anything is written (see compactAvatars).
  if (legacyMigrated) compactAvatars(finishStartup); else finishStartup();
});
