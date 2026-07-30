/* ═══════════════════════════════════════════
   Split Now — App Logic
   ═══════════════════════════════════════════ */

// ─── State ────────────────────────────────
let state = {
  apiKey: localStorage.getItem('sw_api_key') || '',
  oauthToken: localStorage.getItem('sw_oauth_token') || '',
  authMethod: localStorage.getItem('sw_auth_method') || '', // 'oauth' or 'apikey'
  currentUser: null,
  friends: [],
  groups: [],
  currencies: [],
  categories: [],
  selectedFriends: new Set(),
  splitType: 'equal',
  activityOffset: 0,
  isLoadingMore: false,
};

// ─── Init ─────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Set today's date
  document.getElementById('date').value = new Date().toISOString().split('T')[0];

  // Check for OAuth token in URL (callback redirect)
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const oauthError = urlParams.get('oauth_error');

  if (token) {
    // Save OAuth token and clean URL
    state.oauthToken = token;
    state.authMethod = 'oauth';
    localStorage.setItem('sw_oauth_token', token);
    localStorage.setItem('sw_auth_method', 'oauth');
    window.history.replaceState({}, document.title, '/');
    connect();
  } else if (oauthError) {
    window.history.replaceState({}, document.title, '/');
    showToast(`OAuth error: ${oauthError}`, 'error');
  } else if (state.oauthToken && state.authMethod === 'oauth') {
    // Auto-connect with saved OAuth token
    connect();
  } else if (state.apiKey) {
    // Auto-connect with saved API key
    document.getElementById('api-key').value = state.apiKey;
    connect();
  }

  // Check if OAuth is available on the server
  try {
    const res = await fetch('/oauth/status');
    const data = await res.json();
    if (!data.enabled) {
      // Hide OAuth UI if not configured on server
      document.getElementById('oauth-section').classList.add('hidden');
      document.getElementById('auth-divider').classList.add('hidden');
      // Auto-expand API key section
      const fields = document.getElementById('apikey-fields');
      const btn = document.getElementById('btn-expand-apikey');
      fields.classList.remove('collapsed');
      btn.style.display = 'none';
    }
  } catch (e) {
    // If server unreachable, hide OAuth
    document.getElementById('oauth-section').classList.add('hidden');
    document.getElementById('auth-divider').classList.add('hidden');
  }

  // Register service worker with auto-update support
  if ('serviceWorker' in navigator) {
    // Track whether a SW already controls this page (i.e. not a first visit)
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('sw.js').then((registration) => {
      // Check for updates every 60 seconds
      setInterval(() => registration.update(), 60 * 1000);
    }).catch(() => { });

    // When a new service worker takes control, prompt the user to reload
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Skip on first-ever SW registration (no previous controller)
      if (!hadController) return;

      console.log('[SW] New version available');
      showUpdateToast();
    });
  }
});

// ─── API Helpers ──────────────────────────
async function api(endpoint, options = {}) {
  const url = `/api/${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Use appropriate auth header
  if (state.authMethod === 'oauth' && state.oauthToken) {
    headers['Authorization'] = `Bearer ${state.oauthToken}`;
  } else if (state.apiKey) {
    headers['X-API-Key'] = state.apiKey;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Connect ──────────────────────────────
async function connect() {
  const keyInput = document.getElementById('api-key');
  const btn = document.getElementById('btn-connect');

  // If not OAuth, require API key
  if (state.authMethod !== 'oauth') {
    state.apiKey = keyInput.value.trim();
    state.authMethod = 'apikey';

    if (!state.apiKey) {
      shakeInput(keyInput);
      return;
    }
  }

  if (btn) setButtonLoading(btn, true);

  try {
    // Fetch everything in parallel
    const [userData, friendsData, groupsData, currencyData, categoryData, expensesData] = await Promise.all([
      api('current-user'),
      api('friends'),
      api('groups'),
      api('currencies'),
      api('categories'),
      api('expenses?limit=100')
    ]);

    // Validate response
    if (!userData.user) throw new Error('Invalid credentials');

    state.currentUser = userData.user;
    state.friends = friendsData.friends || [];
    state.groups = groupsData.groups || [];
    state.currencies = currencyData.currencies || [];
    state.categories = categoryData.categories || [];
    state.recentExpenses = expensesData.expenses || [];

    // Save auth
    if (state.authMethod === 'apikey') {
      localStorage.setItem('sw_api_key', state.apiKey);
      localStorage.setItem('sw_auth_method', 'apikey');
    }

    // Populate UI
    populateUI();

    // UX: Sync currency symbol and split summary
    const curSelect = document.getElementById('currency');
    const amtInput = document.getElementById('amount');
    
    // Personalized Quick Categories
    populateQuickCategories();

    if (curSelect && amtInput) {
      curSelect.addEventListener('change', () => {
        const sym = curSelect.value === 'INR' ? '₹' : (curSelect.value === 'USD' ? '$' : curSelect.value);
        document.getElementById('amount-currency-symbol').textContent = sym;
        updateSplitSummary();
      });
      amtInput.addEventListener('input', updateSplitSummary);
      document.getElementById('paid-by').addEventListener('change', updateSplitSummary);
      document.getElementById('custom-split')?.addEventListener('input', updateSplitSummary);
    }

    // Switch screen
    showScreen('screen-main');
    if (amtInput) setTimeout(() => amtInput.focus(), 200);
  } catch (err) {
    const msg = state.authMethod === 'oauth'
      ? 'Connection failed. Try signing in again.'
      : 'Connection failed. Check your API key.';
    showToast(msg, 'error');
    // Clear invalid OAuth token
    if (state.authMethod === 'oauth') {
      localStorage.removeItem('sw_oauth_token');
      localStorage.removeItem('sw_auth_method');
      state.oauthToken = '';
      state.authMethod = '';
    }
    console.error(err);
  } finally {
    if (btn) setButtonLoading(btn, false);
  }
}

// ─── OAuth Login ──────────────────────────
function oauthLogin() {
  window.location.href = '/oauth/login';
}

// ─── Toggle API Key Section ───────────────
function toggleApiKeySection() {
  const fields = document.getElementById('apikey-fields');
  const btn = document.getElementById('btn-expand-apikey');
  fields.classList.toggle('collapsed');
  btn.classList.toggle('expanded');
}

// ─── Logout ───────────────────────────────
function logout() {
  localStorage.removeItem('sw_api_key');
  localStorage.removeItem('sw_oauth_token');
  localStorage.removeItem('sw_auth_method');
  state.apiKey = '';
  state.oauthToken = '';
  state.authMethod = '';
  state.currentUser = null;
  document.getElementById('api-key').value = '';
  showScreen('screen-setup');
}

// ─── Populate UI ──────────────────────────
function populateUI() {
  const user = state.currentUser;

  // Avatar
  const avatar = document.getElementById('user-avatar');
  const initials = `${(user.first_name || '')[0] || ''}${(user.last_name || '')[0] || ''}`;
  avatar.textContent = initials;

  // Currency dropdown
  const currencySelect = document.getElementById('currency');
  currencySelect.innerHTML = '';
  const defaultCurrency = user.default_currency || 'INR';
  state.currencies.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.currency_code;
    opt.textContent = c.currency_code;
    if (c.currency_code === defaultCurrency) opt.selected = true;
    currencySelect.appendChild(opt);
  });

  // Category dropdown
  const categorySelect = document.getElementById('category');
  categorySelect.innerHTML = '<option value="">General</option>';

  state.categories.forEach((cat) => {
    if (cat.subcategories) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = cat.name;
      cat.subcategories.forEach((sub) => {
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.textContent = sub.name;
        optGroup.appendChild(opt);
      });
      categorySelect.appendChild(optGroup);
    }
  });

  // Groups dropdown
  const groupSelect = document.getElementById('group');
  groupSelect.innerHTML = '<option value="0">No group (individual)</option>';
  state.groups.forEach((g) => {
    if (g.id === 0) return; // skip non-group
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    groupSelect.appendChild(opt);
  });

  // Friends list
  const allPeople = [
    { ...user, first_name: 'You', last_name: '', isCurrentUser: true },
    ...state.friends
  ];
  state.selectedFriends.add(user.id);
  renderFriends(allPeople);

  // Paid-by dropdown
  const paidBySelect = document.getElementById('paid-by');
  paidBySelect.innerHTML = `<option value="${user.id}">You (${user.first_name})</option>`;
  state.friends.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.first_name} ${f.last_name || ''}`.trim();
    paidBySelect.appendChild(opt);
  });
}

// ─── Friends Rendering ───
const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #fccb90, #d57eeb)',
  'linear-gradient(135deg, #e0c3fc, #8ec5fc)',
];

function renderFriends(friends) {
  const container = document.getElementById('friends-list');

  if (!friends.length) {
    container.innerHTML = '<div class="empty-state">No friends found</div>';
    return;
  }

  container.innerHTML = friends.map((f, i) => {
    const isMe = f.isCurrentUser || f.id === state.currentUser?.id;
    const name = isMe ? 'You' : `${f.first_name} ${f.last_name || ''}`.trim();
    const initial = isMe ? (state.currentUser?.first_name || 'Y')[0] : (f.first_name || '?')[0];
    const color = isMe ? 'linear-gradient(135deg, #5bc5a7, #3a9d82)' : AVATAR_COLORS[i % AVATAR_COLORS.length];
    const hasImage = f.picture && f.picture.medium && !f.picture.medium.includes('default');
    const avatarContent = hasImage
      ? `<img src="${f.picture.medium}" alt="${initial}">`
      : initial;

    const isSelected = state.selectedFriends.has(f.id);

    return `
      <div class="friend-item ${isSelected ? 'selected' : ''}" data-id="${f.id}" onclick="toggleFriend(${f.id})">
        <div class="friend-avatar" style="background: ${color}">${avatarContent}</div>
        <span class="friend-name">${name}</span>
        <div class="friend-check"></div>
      </div>
    `;
  }).join('');
}

function toggleFriend(id) {
  if (state.selectedFriends.has(id)) {
    state.selectedFriends.delete(id);
  } else {
    state.selectedFriends.add(id);
  }

  // Update UI
  document.querySelectorAll('.friend-item').forEach((el) => {
    const fid = parseInt(el.dataset.id, 10);
    el.classList.toggle('selected', state.selectedFriends.has(fid));
  });

  // Update custom split if needed
  if (state.splitType !== 'equal') {
    renderCustomSplit();
  }

  // Update split summary text
  updateSplitSummary();
}

// ─── Group Change ─────────────────────────
function onGroupChange() {
  const groupId = parseInt(document.getElementById('group').value, 10);

  if (groupId === 0) {
    // Show all friends
    const allPeople = [
      { ...state.currentUser, first_name: 'You', last_name: '', isCurrentUser: true },
      ...state.friends
    ];
    state.selectedFriends.clear();
    state.selectedFriends.add(state.currentUser.id);
    renderFriends(allPeople);
  } else {
    // Show only group members
    const group = state.groups.find((g) => g.id === groupId);
    if (group && group.members) {
      const memberIds = group.members.map((m) => m.id);

      const groupPeople = group.members.map((m) => ({
        id: m.id,
        first_name: m.id === state.currentUser.id ? 'You' : m.first_name,
        last_name: m.id === state.currentUser.id ? '' : m.last_name,
        picture: m.picture,
        isCurrentUser: m.id === state.currentUser.id
      }));

      // Sort "You" to the top
      groupPeople.sort((a, b) => (a.isCurrentUser ? -1 : b.isCurrentUser ? 1 : 0));

      state.selectedFriends = new Set(memberIds);
      renderFriends(groupPeople);
    }
  }

  if (state.splitType !== 'equal') {
    renderCustomSplit();
  }

  // Update split summary text
  updateSplitSummary();
}

// ─── Split Type ───────────────────────────
function setSplitType(type) {
  state.splitType = type;

  document.querySelectorAll('.split-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  if (type === 'equal') {
    document.getElementById('custom-split').classList.add('hidden');
  } else {
    renderCustomSplit();
    document.getElementById('custom-split').classList.remove('hidden');
  }

  // Update split summary text
  updateSplitSummary();
}

function renderCustomSplit() {
  const container = document.getElementById('custom-split');
  const selected = getSelectedFriendObjects();
  let suffix = '';
  let placeholder = '0.00';
  let step = '0.01';
  let min = '0';
  let labelHint = '';

  if (state.splitType === 'percent') {
    suffix = '%';
    placeholder = '0';
    min = '0';
  } else if (state.splitType === 'shares') {
    suffix = '×';
    placeholder = '1';
    step = '1';
    min = '1';
    labelHint = '<span class="split-hint">Assign shares (e.g. 2, 1, 1)</span>';
  } else if (state.splitType === 'adjustment') {
    suffix = '±';
    placeholder = '0';
    min = '';
    labelHint = '<span class="split-hint">Equal split + adjustments (e.g. +5 or -5)</span>';
  } else if (state.splitType === 'exact') {
    suffix = '';
    placeholder = '0.00';
    min = '0';
  }

  let html = labelHint ? `<div class="split-label-hint">${labelHint}</div>` : '';
  html += selected.map((f) => {
    const name = `${f.first_name} ${f.last_name || ''}`.trim();
    const minAttr = min !== '' ? `min="${min}"` : '';
    return `
      <div class="split-row">
        <span class="friend-name">${name}</span>
        <input type="number" class="split-input" data-user-id="${f.id}"
               placeholder="${placeholder}" step="${step}" ${minAttr} inputmode="decimal">
        <span class="split-suffix">${suffix}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// ─── Create Expense ───────────────────────
function populateQuickCategories() {
  const container = document.querySelector('.quick-categories');
  if (!container || !state.recentExpenses) return;

  const counts = {};
  state.recentExpenses.forEach(exp => {
    if (exp.deleted_at || !exp.category || !exp.category.name) return;
    const name = exp.category.name;
    counts[name] = (counts[name] || 0) + 1;
  });

  // Sort by frequency
  let topCats = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
    .slice(0, 4);

  // Fallbacks if not enough data
  const fallbacks = ['Dining out', 'Groceries', 'Taxi', 'Internet'];
  while (topCats.length < 4 && fallbacks.length > 0) {
    const next = fallbacks.shift();
    if (!topCats.includes(next)) topCats.push(next);
  }

  // Icons mapping
  const iconMap = {
    'Dining out': '🍴', 'Groceries': '🛒', 'Taxi': '🚗', 'Internet': '🌐',
    'General': '📦', 'Rent': '🏠', 'Utilities': '💡', 'Entertainment': '🎬',
    'Gas/fuel': '⛽', 'Gifts': '🎁', 'Maintenance': '🛠️', 'Cleaning': '🧹'
  };

  container.innerHTML = topCats.map(cat => {
    const icon = iconMap[cat] || '🏷️';
    const shortName = cat.length > 12 ? cat.substring(0, 10) + '..' : cat;
    return `<button type="button" class="quick-cat-btn" onclick="quickSelectCategory('${cat}')">${icon} ${shortName}</button>`;
  }).join('');
}

function quickSelectCategory(name) {
  const select = document.getElementById('category');
  if (!select) return;
  
  // Find option with name
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].text.toLowerCase().includes(name.toLowerCase())) {
      select.selectedIndex = i;
      // Visual feedback
      const btn = Array.from(document.querySelectorAll('.quick-cat-btn')).find(b => b.textContent.includes(name));
      if (btn) {
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 600);
      }
      break;
    }
  }
}

function updateSplitSummary() {
  const amount = parseFloat(document.getElementById('amount').value) || 0;
  const currency = document.getElementById('currency').value;
  const splitType = state.splitType;
  const paidBy = parseInt(document.getElementById('paid-by').value, 10);
  const paidBySelf = paidBy === state.currentUser?.id;
  const selectedFriends = Array.from(document.querySelectorAll('.friend-item.selected'));
  const splitWithCount = selectedFriends.length;
  
  const hintEl = document.getElementById('split-hint');
  if (!hintEl) return;

  const symbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency);

  if (amount <= 0) {
    hintEl.textContent = 'Enter amount';
    return;
  }

  if (splitWithCount === 0) {
    hintEl.textContent = 'Select at least one person to split with';
    return;
  }

  if (splitType === 'equal') {
    const share = (amount / splitWithCount).toFixed(2);
    const isSelfInSplit = state.selectedFriends.has(state.currentUser?.id);

    if (paidBySelf) {
      if (isSelfInSplit) {
        if (splitWithCount === 1) {
          hintEl.textContent = `You pay ${symbol}${amount.toFixed(2)} and owe it all yourself`;
        } else {
          hintEl.textContent = `You pay ${symbol}${amount.toFixed(2)}, others owe you ${symbol}${share} each`;
        }
      } else {
        hintEl.textContent = `You pay ${symbol}${amount.toFixed(2)}, others owe you ${symbol}${share} each`;
      }
    } else {
      if (isSelfInSplit) {
        hintEl.textContent = `Friend pays, you owe ${symbol}${share}`;
      } else {
        hintEl.textContent = `Friend pays, you owe ${symbol}0.00`;
      }
    }
  } else if (splitType === 'adjustment') {
    let totalAdj = 0;
    document.querySelectorAll('.split-input').forEach(input => {
      totalAdj += parseFloat(input.value || 0);
    });
    const baseShare = (amount - totalAdj) / splitWithCount;
    if (baseShare < 0) {
      hintEl.textContent = `Adjustments exceed total amount (${symbol}${totalAdj.toFixed(2)})`;
    } else {
      const sign = totalAdj >= 0 ? '+' : '';
      hintEl.textContent = `Base share ${symbol}${baseShare.toFixed(2)} (net adjustments ${symbol}${sign}${totalAdj.toFixed(2)})`;
    }
  } else {
    hintEl.textContent = `Custom split with ${splitWithCount} friends`;
  }
}

async function createExpense(event) {
  event.preventDefault();

  const btn = document.getElementById('btn-submit');
  const description = document.getElementById('description').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  const currency = document.getElementById('currency').value;
  const date = document.getElementById('date').value;
  const category = document.getElementById('category').value;
  const groupId = parseInt(document.getElementById('group').value, 10);
  const paidBy = parseInt(document.getElementById('paid-by').value, 10);
  const notes = document.getElementById('notes').value.trim();

  // Validate
  if (!description) { shakeInput(document.getElementById('description')); return; }
  if (!amount || amount <= 0) { shakeInput(document.getElementById('amount')); return; }


  setButtonLoading(btn, true);

  try {
    const selectedIds = [...state.selectedFriends];
    if (selectedIds.length === 0) {
      showToast('Please select at least one person to split with', 'error');
      setButtonLoading(btn, false);
      return;
    }

    // Splitwise requires everyone in the expense to be in the users list.
    // This includes everyone who owes money AND the person who paid.
    const peopleInSplit = selectedIds;
    const allUserIds = [...peopleInSplit];
    if (!allUserIds.includes(paidBy)) {
      allUserIds.push(paidBy);
    }

    const totalPeopleInSplit = peopleInSplit.length;

    // Build expense data
    const expenseData = {
      cost: amount.toFixed(2),
      description,
      currency_code: currency,
      date: date + 'T00:00:00Z',
      group_id: groupId || 0,
      details: notes || undefined,
      category_id: category ? parseInt(category, 10) : 0,
    };

    // Build user shares
    if (state.splitType === 'equal') {
      const share = (amount / totalPeopleInSplit).toFixed(2);
      // Adjust rounding for first user in the split
      const remainder = (amount - share * totalPeopleInSplit).toFixed(2);
      const firstShare = (parseFloat(share) + parseFloat(remainder)).toFixed(2);

      allUserIds.forEach((uid, i) => {
        const isInSplit = peopleInSplit.includes(uid);
        const userOwedShare = isInSplit
          ? (uid === peopleInSplit[0] ? firstShare : share)
          : '0.00';

        expenseData[`users__${i}__user_id`] = uid;
        expenseData[`users__${i}__paid_share`] = uid === paidBy ? amount.toFixed(2) : '0.00';
        expenseData[`users__${i}__owed_share`] = userOwedShare;
      });
    } else if (state.splitType === 'exact') {
      allUserIds.forEach((uid, i) => {
        const input = document.querySelector(`.split-input[data-user-id="${uid}"]`);
        const owedShare = input ? parseFloat(input.value || 0).toFixed(2) : '0.00';
        expenseData[`users__${i}__user_id`] = uid;
        expenseData[`users__${i}__paid_share`] = uid === paidBy ? amount.toFixed(2) : '0.00';
        expenseData[`users__${i}__owed_share`] = owedShare;
      });
    } else if (state.splitType === 'percent') {
      allUserIds.forEach((uid, i) => {
        const input = document.querySelector(`.split-input[data-user-id="${uid}"]`);
        const pct = parseFloat(input?.value || 0);
        const owedShare = ((pct / 100) * amount).toFixed(2);
        expenseData[`users__${i}__user_id`] = uid;
        expenseData[`users__${i}__paid_share`] = uid === paidBy ? amount.toFixed(2) : '0.00';
        expenseData[`users__${i}__owed_share`] = owedShare;
      });
    } else if (state.splitType === 'shares') {
      // Calculate total shares
      let totalShares = 0;
      const sharesMap = {};
      peopleInSplit.forEach((uid) => {
        const input = document.querySelector(`.split-input[data-user-id="${uid}"]`);
        const shares = parseFloat(input?.value || 1);
        sharesMap[uid] = shares;
        totalShares += shares;
      });

      let allocated = 0;
      allUserIds.forEach((uid, i) => {
        let owedShare = '0.00';
        if (peopleInSplit.includes(uid)) {
          const splitIdx = peopleInSplit.indexOf(uid);
          if (splitIdx === peopleInSplit.length - 1) {
            owedShare = (amount - allocated).toFixed(2);
          } else {
            owedShare = ((sharesMap[uid] / totalShares) * amount).toFixed(2);
            allocated += parseFloat(owedShare);
          }
        }
        expenseData[`users__${i}__user_id`] = uid;
        expenseData[`users__${i}__paid_share`] = uid === paidBy ? amount.toFixed(2) : '0.00';
        expenseData[`users__${i}__owed_share`] = owedShare;
      });
    } else if (state.splitType === 'adjustment') {
      // Equal split + per-person adjustments
      let totalAdj = 0;
      const adjMap = {};

      peopleInSplit.forEach((uid) => {
        const input = document.querySelector(`.split-input[data-user-id="${uid}"]`);
        const adj = parseFloat(input?.value || 0);
        adjMap[uid] = isNaN(adj) ? 0 : adj;
        totalAdj += adjMap[uid];
      });

      const baseShare = (amount - totalAdj) / totalPeopleInSplit;

      let allocated2 = 0;
      allUserIds.forEach((uid, i) => {
        let owedShare = '0.00';
        if (peopleInSplit.includes(uid)) {
          const splitIdx = peopleInSplit.indexOf(uid);
          if (splitIdx === peopleInSplit.length - 1) {
            owedShare = Math.max(0, amount - allocated2).toFixed(2);
          } else {
            const rawShare = Math.max(0, baseShare + adjMap[uid]);
            owedShare = rawShare.toFixed(2);
            allocated2 += parseFloat(owedShare);
          }
        }
        expenseData[`users__${i}__user_id`] = uid;
        expenseData[`users__${i}__paid_share`] = uid === paidBy ? amount.toFixed(2) : '0.00';
        expenseData[`users__${i}__owed_share`] = owedShare;
      });
    }

    const result = await api('expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData),
    });

    if (result.errors && Object.keys(result.errors).length > 0) {
      const errorMsg = Object.values(result.errors).flat().join(', ');
      showToast(`Error: ${errorMsg}`, 'error');
    } else {
      showToast(`"${description}" created!`, 'success');
      resetForm();
      populateQuickCategories();
      fetchActivityData();
    }
  } catch (err) {
    showToast('Failed to create expense', 'error');
    console.error(err);
  } finally {
    setButtonLoading(btn, false);
  }
}

// ─── Helpers ──────────────────────────────
function getSelectedFriendObjects() {
  const allPeople = [
    { ...state.currentUser, first_name: 'You', last_name: '', isCurrentUser: true },
    ...state.friends
  ];

  // Also check group members for those not in friends list
  const groupId = parseInt(document.getElementById('group').value, 10);
  if (groupId !== 0) {
    const group = state.groups.find((g) => g.id === groupId);
    if (group && group.members) {
      group.members.forEach((m) => {
        if (!allPeople.find((p) => p.id === m.id)) {
          allPeople.push({
            ...m,
            first_name: m.id === state.currentUser.id ? 'You' : m.first_name,
            last_name: m.id === state.currentUser.id ? '' : m.last_name,
            isCurrentUser: m.id === state.currentUser.id
          });
        }
      });
    }
  }

  return allPeople.filter((p) => state.selectedFriends.has(p.id));
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  
  const mainNav = document.getElementById('main-nav');
  if (mainNav) {
    if (screenId === 'screen-setup') {
      mainNav.classList.add('hidden');
    } else {
      mainNav.classList.remove('hidden');
    }
  }
}

function setButtonLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  if (loading) {
    text.classList.add('hidden');
    loader.classList.remove('hidden');
    btn.disabled = true;
  } else {
    text.classList.remove('hidden');
    loader.classList.add('hidden');
    btn.disabled = false;
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.onclick = null;

  // Force reflow
  toast.offsetHeight;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3000);
}

function showUpdateToast() {
  const toast = document.getElementById('toast');
  toast.textContent = '🔄 New version available — tap to update';
  toast.className = 'toast update';

  toast.offsetHeight;
  toast.classList.add('visible');

  toast.onclick = () => window.location.reload();
  // Don't auto-dismiss — let the user decide when to reload
}

function shakeInput(input) {
  input.style.animation = 'none';
  input.offsetHeight;
  input.style.animation = 'shake 0.4s ease';
  input.focus();
  setTimeout(() => { input.style.animation = ''; }, 400);
}

// Add shake animation
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    50% { transform: translateX(8px); }
    75% { transform: translateX(-4px); }
  }
`;
document.head.appendChild(shakeStyle);

function resetForm() {
  document.getElementById('description').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('notes').value = '';
  document.getElementById('date').value = new Date().toISOString().split('T')[0];
  state.selectedFriends.clear();
  if (state.currentUser) {
    state.selectedFriends.add(state.currentUser.id);
  }
  document.querySelectorAll('.friend-item').forEach((el) => {
    const fid = parseInt(el.dataset.id, 10);
    el.classList.toggle('selected', state.selectedFriends.has(fid));
  });
  setSplitType('equal');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Tab Navigation ───────────────────────
function showTab(screenId) {
  showScreen(screenId);

  // Update all nav tabs across all screens
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === screenId);
  });

  if (!state.currentUser) return;
  const user = state.currentUser;
  const initials = `${(user.first_name || '')[0] || ''}${(user.last_name || '')[0] || ''}`;

  if (screenId === 'screen-main') {
    setTimeout(() => document.getElementById('amount').focus(), 100);
  } else if (screenId === 'screen-usage') {
    document.getElementById('usage-user-avatar').textContent = initials;
    fetchUsageData();
  } else if (screenId === 'screen-analysis') {
    document.getElementById('analysis-user-avatar').textContent = initials;
    fetchAnalysisData();
  } else if (screenId === 'screen-balances') {
    document.getElementById('balances-user-avatar').textContent = initials;
    fetchBalancesData();
  } else if (screenId === 'screen-activity') {
    document.getElementById('activity-user-avatar').textContent = initials;
    fetchActivityData();
  }
}

// ─── Usage Report ─────────────────────────
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CATEGORY_COLORS = [
  '#5bc5a7', '#f5576c', '#4facfe', '#fa709a', '#43e97b',
  '#fccb90', '#a18cd1', '#667eea', '#f093fb', '#38f9d7',
  '#fee140', '#d57eeb', '#8ec5fc', '#e0c3fc', '#00f2fe',
];

// Initialize month to current
(function initUsageMonth() {
  const now = new Date();
  state.usageMonth = now.getMonth();
  state.usageYear = now.getFullYear();
})();

function updateMonthLabel() {
  document.getElementById('month-label').textContent =
    `${MONTH_NAMES[state.usageMonth]} ${state.usageYear}`;
}

function prevMonth() {
  state.usageMonth--;
  if (state.usageMonth < 0) {
    state.usageMonth = 11;
    state.usageYear--;
  }
  updateMonthLabel();
  fetchUsageData();
}

function nextMonth() {
  state.usageMonth++;
  if (state.usageMonth > 11) {
    state.usageMonth = 0;
    state.usageYear++;
  }
  updateMonthLabel();
  fetchUsageData();
}

async function fetchUsageData() {
  const container = document.getElementById('usage-report');
  container.innerHTML = '<div class="usage-loading"><span class="spinner"></span></div>';

  updateMonthLabel();

  const year = state.usageYear;
  const month = state.usageMonth;

  // Date range: from the last second of the previous month to the 1st of the next month
  const prevMonthLastDate = new Date(year, month, 0);
  const dateAfter = `${prevMonthLastDate.getFullYear()}-${String(prevMonthLastDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthLastDate.getDate()).padStart(2, '0')}T23:59:59Z`;

  const nextMonthDate = new Date(year, month + 1, 1);
  const dateBefore = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`;

  try {
    const data = await api(`expenses?dated_after=${dateAfter}&dated_before=${dateBefore}&limit=999`);
    const expenses = data.expenses || [];
    const report = aggregateByCategory(expenses);
    renderUsageReport(report);
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Failed to load expenses</div>';
    console.error(err);
  }
}

function aggregateByCategory(expenses) {
  const userId = state.currentUser?.id;
  const categoryMap = {};
  let total = 0;
  let currency = state.currentUser?.default_currency || 'INR';
  let expenseCount = 0;
  const uncategorized = []; // track expenses with no real category

  // Build a lookup from subcategory ID -> parent category name
  // Splitwise has parent categories (e.g. "Food and Drink") with subcategories
  // (e.g. "Groceries", "General"). We want to group by the parent name.
  const subToParentName = {};
  const subIdToSubName = {};
  (state.categories || []).forEach((cat) => {
    subToParentName[cat.id] = cat.name;
    subIdToSubName[cat.id] = cat.name;
    if (cat.subcategories) {
      cat.subcategories.forEach((sub) => {
        subToParentName[sub.id] = cat.name; // map subcategory to PARENT name
        subIdToSubName[sub.id] = sub.name;
      });
    }
  });

  expenses.forEach((exp) => {
    if (exp.deleted_at) return; // skip deleted
    if (exp.payment) return; // skip payments/settlements
    if (exp.creation_method === 'payment') return; // extra guard for settle-ups
    if (/^settle\s+all\s+balances$/i.test(exp.description)) return; // skip settle-all

    // Find user's owed share
    const userShare = (exp.users || []).find((u) => u.user_id === userId || u.user?.id === userId);
    if (!userShare) return;

    const owed = parseFloat(userShare.owed_share || 0);
    if (owed <= 0) return;

    const catId = exp.category?.id || 0;
    const subName = subIdToSubName[catId] || exp.category?.name || '';
    const catName = subToParentName[catId] || exp.category?.name || 'Other';
    currency = exp.currency_code || currency;

    // Track uncategorized: subcategory is "General" or no category at all
    if (subName === 'General' || catName === 'Other' || !catId) {
      uncategorized.push({
        description: exp.description || 'Untitled',
        amount: owed,
        date: exp.date,
      });
    }

    if (!categoryMap[catName]) {
      categoryMap[catName] = { name: catName, amount: 0, count: 0, subcategories: {} };
    }
    categoryMap[catName].amount += owed;
    categoryMap[catName].count++;

    if (subName) {
      if (!categoryMap[catName].subcategories[subName]) {
        categoryMap[catName].subcategories[subName] = { name: subName, amount: 0, count: 0 };
      }
      categoryMap[catName].subcategories[subName].amount += owed;
      categoryMap[catName].subcategories[subName].count++;
    }

    total += owed;
    expenseCount++;
  });

  // Sort by amount descending
  const categories = Object.values(categoryMap).sort((a, b) => b.amount - a.amount);

  return { total, currency, categories, expenseCount, uncategorized };
}

function renderUsageReport({ total, currency, categories, expenseCount, uncategorized }) {
  const container = document.getElementById('usage-report');
  const monthLabel = document.getElementById('month-label').textContent;
  const topCategory = categories.length > 0 ? categories[0].name : 'N/A';

  if (expenseCount === 0) {
    container.innerHTML = `
      <div class="report-card glass hero-analysis" style="text-align: center; padding: 40px 20px;">
        <span class="analysis-hero-label">Total Spent (${monthLabel})</span>
        <span class="analysis-hero-amount" style="opacity: 0.5">${currency} 0.00</span>
        <div style="margin-top: 20px; color: var(--text-hint)">No expenses recorded for this period</div>
      </div>
    `;
    return;
  }

  const maxAmount = categories.length > 0 ? categories[0].amount : 1;

  let barsHtml = categories.map((cat, i) => {
    const pct = total > 0 ? ((cat.amount / total) * 100).toFixed(1) : 0;
    const barWidth = ((cat.amount / maxAmount) * 100).toFixed(1);
    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];

    const subcats = Object.values(cat.subcategories || {}).sort((a, b) => b.amount - a.amount);
    let subcatsHtml = '';
    if (subcats.length > 0) {
      subcatsHtml = `
        <div class="nreport-subcats" style="border-left-color: ${color}">
          ${subcats.map(sub => {
        const subPct = cat.amount > 0 ? ((sub.amount / cat.amount) * 100).toFixed(1) : 0;
        return `
              <div class="report-subcat-row">
                <span class="report-subcat-name">${sub.name}</span>
                <span class="report-subcat-amount">${sub.amount.toFixed(2)} (${subPct}%)</span>
              </div>
            `;
      }).join('')}
        </div>
      `;
    }

    return `
      <div class="report-bar-group">
        <div class="report-bar-row">
          <div class="report-bar-label">
            <span class="report-cat-dot" style="background:${color}"></span>
            <span class="report-cat-name">${cat.name}</span>
          </div>
          <div class="report-bar-track">
            <div class="report-bar-fill" style="width:0%;background:${color}" data-width="${barWidth}%"></div>
          </div>
          <div class="report-bar-value">
            <span class="report-bar-amount">${cat.amount.toFixed(2)}</span>
            <span class="report-bar-pct">${pct}%</span>
          </div>
        </div>
        ${subcatsHtml}
      </div>
    `;
  }).join('');

  let summaryHtml = `
    <div class="report-summary-row">
      <span class="report-summary-label">Total Expenses</span>
      <span class="report-summary-count">${expenseCount}</span>
    </div>
  `;

  // Uncategorized expenses section
  let uncategorizedHtml = '';
  if (uncategorized && uncategorized.length > 0) {
    const items = uncategorized.map((exp) => {
      const date = exp.date ? new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
      return `
        <div class="uncat-item">
          <span class="uncat-desc">${exp.description}</span>
          <div class="uncat-meta">
            <span class="uncat-date">${date}</span>
            <span class="uncat-amount">${exp.amount.toFixed(2)}</span>
          </div>
        </div>
      `;
    }).join('');

    uncategorizedHtml = `
      <div class="report-divider"></div>
      <div class="uncat-section">
        <div class="uncat-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <span>Uncategorized (${uncategorized.length})</span>
        </div>
        <div class="uncat-list">${items}</div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="report-card glass hero-analysis">
      <div class="analysis-hero-main">
        <span class="analysis-hero-label">Total Spent (${monthLabel})</span>
        <span class="analysis-hero-amount">${currency} ${total.toFixed(2)}</span>
      </div>
      <div class="analysis-hero-grid">
        <div class="analysis-stat">
          <span class="stat-label">Expense Count</span>
          <span class="stat-value">${expenseCount}</span>
        </div>
        <div class="analysis-stat">
          <span class="stat-label">Top Category</span>
          <span class="stat-value">${topCategory}</span>
        </div>
      </div>
    </div>

    <div class="report-card glass" style="margin-top: 20px;">
      <h4 class="card-title-sm">Category Breakdown</h4>
      <div class="report-bars">
        ${barsHtml}
      </div>
      <div class="report-divider"></div>
      ${summaryHtml}
      ${uncategorizedHtml}
    </div>
  `;

  // Animate bars
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll('.report-bar-fill').forEach((bar) => {
        bar.style.width = bar.dataset.width;
      });
    }, 50);
  });
}

// ─── Trends Report ────────────────────────

async function fetchAnalysisData() {
  const content = document.getElementById('analysis-content');
  const trendsChart = document.getElementById('analysis-trends-chart');
  content.innerHTML = '<div class="usage-loading"><span class="spinner"></span></div>';
  trendsChart.innerHTML = '<div class="usage-loading"><span class="spinner"></span></div>';

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Date range for current month
  const dateAfter = new Date(currentYear, currentMonth, 1).toISOString();
  const dateBefore = new Date(currentYear, currentMonth + 1, 1).toISOString();

  try {
    // 1. Fetch current month for daily distribution
    const data = await api(`expenses?dated_after=${dateAfter}&dated_before=${dateBefore}&limit=999`);
    const expenses = data.expenses || [];
    const userId = state.currentUser?.id;
    const currency = state.currentUser?.default_currency || 'INR';

    const dailyTotals = new Array(daysInMonth).fill(0);
    let totalSpent = 0;
    let weekendSpent = 0;
    let weekdaySpent = 0;
    let maxDaily = 0;
    let maxDayIdx = 0;

    expenses.forEach(exp => {
      if (exp.deleted_at || exp.payment || exp.creation_method === 'payment') return;
      if (/^settle\s+all\s+balances$/i.test(exp.description)) return;

      const userShare = (exp.users || []).find(u => u.user_id === userId || u.user?.id === userId);
      if (!userShare) return;

      const owed = parseFloat(userShare.owed_share || 0);
      if (owed <= 0) return;

      const expDate = new Date(exp.date);
      const day = expDate.getDate();
      const dayIdx = day - 1;
      
      if (dayIdx >= 0 && dayIdx < daysInMonth) {
        dailyTotals[dayIdx] += owed;
        totalSpent += owed;
        
        const dayOfWeek = expDate.getDay(); // 0=Sun, 6=Sat
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekendSpent += owed;
        } else {
          weekdaySpent += owed;
        }

        if (dailyTotals[dayIdx] > maxDaily) {
          maxDaily = dailyTotals[dayIdx];
          maxDayIdx = dayIdx;
        }
      }
    });

    const avgDaily = totalSpent / daysInMonth;
    
    // Render the analysis top section
    renderAnalysis(dailyTotals, totalSpent, avgDaily, maxDaily, maxDayIdx + 1, weekendSpent, weekdaySpent, currency);

    // 2. Load Trends (reusing logic but pointing to new container)
    fetchTrendsData('analysis-trends-chart');

  } catch (err) {
    content.innerHTML = '<div class="empty-state">Failed to load analysis</div>';
    console.error(err);
  }
}

window.selectCalendarDay = function(el, day, amount, currency) {
  document.querySelectorAll('.calendar-cell').forEach(cell => cell.classList.remove('selected'));
  if (el) el.classList.add('selected');
  
  const detailEl = document.getElementById('calendar-detail');
  if (!detailEl) return;

  const now = new Date();
  const currentMonth = now.getMonth();
  const monthName = MONTH_NAMES[currentMonth];
  
  if (amount > 0) {
    detailEl.innerHTML = `
      <div class="detail-active">
        <span class="detail-date">${monthName} ${day}</span>
        <span class="detail-amount">${currency} ${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} spent</span>
      </div>
    `;
  } else {
    detailEl.innerHTML = `
      <div class="detail-active">
        <span class="detail-date">${monthName} ${day}</span>
        <span class="detail-amount no-spend">No expenses logged</span>
      </div>
    `;
  }
};

function renderAnalysis(dailyTotals, totalSpent, avgDaily, maxDaily, maxDay, weekendSpent, weekdaySpent, currency) {
  const container = document.getElementById('analysis-content');
  
  // Calculate first day index of current month
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const firstDayIdx = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday, 1 = Monday...

  let calendarCellsHtml = '';

  // Weekdays headers
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const weekdaysHtml = weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('');

  // Add empty spaces for days before the 1st of the month
  for (let i = 0; i < firstDayIdx; i++) {
    calendarCellsHtml += `<div class="calendar-cell empty"></div>`;
  }

  // Add days
  for (let day = 1; day <= dailyTotals.length; day++) {
    const amt = dailyTotals[day - 1];
    const ratio = maxDaily > 0 ? (amt / maxDaily) : 0;
    
    let cellStyle = '';
    if (amt > 0) {
      const opacity = 0.15 + (ratio * 0.85); // between 0.15 and 1.0
      cellStyle = `background: rgba(91, 197, 167, ${opacity.toFixed(2)}); border-color: rgba(91, 197, 167, ${(opacity + 0.1).toFixed(2)}); color: #fff; font-weight: 600;`;
      if (ratio > 0.75) {
        cellStyle += `box-shadow: 0 0 8px rgba(91, 197, 167, 0.4);`;
      }
    }

    calendarCellsHtml += `
      <div class="calendar-cell ${amt > 0 ? 'has-spend' : ''}" 
           style="${cellStyle}" 
           data-day="${day}" 
           data-amount="${amt}"
           onclick="selectCalendarDay(this, ${day}, ${amt}, '${currency}')">
        <span class="cell-day-num">${day}</span>
      </div>
    `;
  }

  const weekendPct = totalSpent > 0 ? Math.round((weekendSpent / totalSpent) * 100) : 0;
  const currentMonthName = MONTH_NAMES[currentMonth];

  container.innerHTML = `
    <div class="report-card glass hero-analysis">
      <div class="analysis-hero-main">
        <span class="analysis-hero-label">Total Spent (${currentMonthName})</span>
        <span class="analysis-hero-amount">${currency} ${totalSpent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
      </div>
      <div class="analysis-hero-grid">
        <div class="analysis-stat">
          <span class="stat-label">Daily Average</span>
          <span class="stat-value">${currency} ${Math.round(avgDaily).toLocaleString()}</span>
        </div>
        <div class="analysis-stat">
          <span class="stat-label">Peak Spending</span>
          <span class="stat-value">${currency} ${Math.round(maxDaily).toLocaleString()}</span>
        </div>
      </div>
    </div>

    <div class="report-card glass" style="margin-top: 20px; padding: 20px;">
      <div class="calendar-header-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h4 class="card-title-sm" style="margin-bottom: 0;">Current Month Heatmap</h4>
        <span class="calendar-month-year" style="font-size: 13px; font-weight: 600; color: var(--green); text-transform: uppercase; letter-spacing: 0.5px;">${currentMonthName} ${currentYear}</span>
      </div>
      
      <div class="calendar-container" style="background: rgba(255, 255, 255, 0.01); border-radius: 12px; padding: 12px; border: 1px solid var(--border);">
        <div class="calendar-weekdays-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; margin-bottom: 8px;">
          ${weekdaysHtml}
        </div>
        <div class="calendar-days-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;">
          ${calendarCellsHtml}
        </div>
      </div>

      <div class="calendar-detail-card" id="calendar-detail" style="margin-top: 16px; padding: 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); text-align: center; min-height: 48px; display: flex; align-items: center; justify-content: center;">
        <span class="detail-placeholder" style="font-size: 13px; color: var(--text-dim);">Tap any day to see details</span>
      </div>
    </div>

    <div class="analysis-grid-stats" style="margin-top: 20px;">
      <div class="report-card glass stat-card">
        <span class="stat-label">Weekend Spend</span>
        <span class="stat-value">${weekendPct}%</span>
        <div class="stat-progress-bg">
          <div class="stat-progress-fill" style="width: ${weekendPct}%"></div>
        </div>
      </div>
      <div class="report-card glass stat-card">
        <span class="stat-label">Most Expensive</span>
        <span class="stat-value">Day ${maxDay}</span>
        <span class="stat-hint">${currency} ${Math.round(maxDaily).toLocaleString()} spent</span>
      </div>
    </div>
  `;
}

async function fetchTrendsData(targetId = 'trends-chart') {
  const container = document.getElementById(targetId);
  if (!container) return;
  container.innerHTML = '<div class="usage-loading"><span class="spinner"></span></div>';

  const now = new Date();
  const currentYear = now.getFullYear();

  // Get date range for the current year
  const dateAfter = `${currentYear}-01-01T00:00:00Z`;
  const dateBefore = `${currentYear + 1}-01-01T00:00:00Z`;

  try {
    const data = await api(`expenses?dated_after=${dateAfter}&dated_before=${dateBefore}&limit=999`);
    const expenses = data.expenses || [];
    
    // Build category lookups
    const subIdToSubName = {};
    (state.categories || []).forEach((cat) => {
      subIdToSubName[cat.id] = cat.name;
      if (cat.subcategories) {
        cat.subcategories.forEach((sub) => {
          subIdToSubName[sub.id] = sub.name;
        });
      }
    });

    // Determine the 12 month buckets for the current year
    const numBuckets = 12;
    const monthLabels = [];
    for (let i = 0; i < numBuckets; i++) {
      monthLabels.push({
        month: i,
        year: currentYear,
        label: MONTH_NAMES[i].substring(0, 3)
      });
    }

    const subcatMap = {}; // name -> { name, total, amounts: [0, ..., 0] (12 zeros) }
    const userId = state.currentUser?.id;
    let currency = state.currentUser?.default_currency || 'INR';

    expenses.forEach((exp) => {
      if (exp.deleted_at) return;
      if (exp.payment) return;
      if (exp.creation_method === 'payment') return;
      if (/^settle\s+all\s+balances$/i.test(exp.description)) return;

      const userShare = (exp.users || []).find((u) => u.user_id === userId || u.user?.id === userId);
      if (!userShare) return;

      const owed = parseFloat(userShare.owed_share || 0);
      if (owed <= 0) return;

      currency = exp.currency_code || currency;

      const catId = exp.category?.id || 0;
      let subName = subIdToSubName[catId] || exp.category?.name || 'Other';
      
      const expDate = new Date(exp.date);
      const m = expDate.getMonth();
      const y = expDate.getFullYear();

      // Find which bucket this belongs to
      const bucketIdx = monthLabels.findIndex(md => md.month === m && md.year === y);
      if (bucketIdx !== -1) {
        if (!subcatMap[subName]) {
          subcatMap[subName] = { name: subName, total: 0, amounts: new Array(numBuckets).fill(0) };
        }
        subcatMap[subName].amounts[bucketIdx] += owed;
        subcatMap[subName].total += owed;
      }
    });

    const subcategoriesData = Object.values(subcatMap).sort((a, b) => b.total - a.total);

    renderTrends(subcategoriesData, monthLabels, currency, targetId);
  } catch (err) {
    container.innerHTML = '<div class="empty-state" style="width:100%;">Failed to load trends</div>';
    console.error(err);
  }
}

function renderTrends(subcategoriesData, monthLabels, currency, targetId = 'trends-chart') {
  const container = document.getElementById(targetId);

  if (subcategoriesData.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="width:100%;">
        <p>No expenses in the last 3 months</p>
      </div>
    `;
    return;
  }

  // Display top 15 subcategories
  const topSubcats = subcategoriesData.slice(0, 15);

  const cardsHtml = topSubcats.map((subcat) => {
    const maxVal = Math.max(...subcat.amounts, 1);
    
    const barsHtml = subcat.amounts.map((amt, idx) => {
      const heightPct = ((amt / maxVal) * 100).toFixed(1);
      return `
        <div class="trend-mini-bar-wrapper">
          <span class="trend-mini-value">${amt > 0 ? Math.round(amt) : ''}</span>
          <div class="trend-mini-bar-track">
            <div class="trend-mini-bar-fill" style="height: 0%" data-height="${heightPct}%"></div>
          </div>
          <span class="trend-mini-label">${monthLabels[idx].label}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="trend-subcat-card">
        <div class="trend-subcat-header">
          <span class="trend-subcat-name">${subcat.name}</span>
          <span class="trend-subcat-total">${currency} ${subcat.total.toFixed(2)}</span>
        </div>
        <div class="trend-mini-bars-container">
          ${barsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = cardsHtml;

  // Animate bars
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll('.trend-mini-bar-fill').forEach((bar) => {
        bar.style.height = bar.dataset.height;
      });
    }, 50);
  });
}

// ─── Balances Report ───────────────────────

function fetchBalancesData() {
  const container = document.getElementById('balances-list');
  const heroContainer = document.getElementById('balances-hero');
  
  if (!state.friends || state.friends.length === 0) {
    container.innerHTML = '<div class="empty-state">No friends found.</div>';
    heroContainer.innerHTML = '';
    return;
  }

  const balances = [];
  let totalOwed = 0;
  let totalOwe = 0;
  let currency = state.currentUser?.default_currency || 'INR';

  state.friends.forEach(f => {
    if (f.balance && f.balance.length > 0) {
      const amount = parseFloat(f.balance[0].amount);
      if (amount !== 0) {
        currency = f.balance[0].currency_code;
        if (amount > 0) totalOwed += amount;
        else totalOwe += Math.abs(amount);

        balances.push({
          id: f.id,
          name: `${f.first_name} ${f.last_name || ''}`.trim(),
          amount: amount,
          currency: f.balance[0].currency_code
        });
      }
    }
  });

  // Render Hero
  const netBalance = totalOwed - totalOwe;
  const netColor = netBalance >= 0 ? 'var(--green)' : 'var(--red)';
  const netSign = netBalance >= 0 ? '+' : '';

  heroContainer.innerHTML = `
    <div class="report-card glass hero-analysis">
      <div class="analysis-hero-main">
        <span class="analysis-hero-label">Net Balance</span>
        <span class="analysis-hero-amount" style="color: ${netColor}">${netSign}${currency} ${Math.abs(netBalance).toLocaleString()}</span>
      </div>
      <div class="analysis-hero-grid">
        <div class="analysis-stat">
          <span class="stat-label">You are owed</span>
          <span class="stat-value" style="color: var(--green)">${currency} ${totalOwed.toLocaleString()}</span>
        </div>
        <div class="analysis-stat">
          <span class="stat-label">You owe</span>
          <span class="stat-value" style="color: var(--red)">${currency} ${totalOwe.toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;

  balances.sort((a, b) => b.amount - a.amount);

  if (balances.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="margin-top: 20px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <p>You are all settled up!</p>
      </div>
    `;
    return;
  }

  const html = balances.map(b => {
    const isOwed = b.amount > 0;
    const color = isOwed ? 'var(--green)' : 'var(--red)';
    const text = isOwed ? 'owes you' : 'you owe';
    const amountStr = Math.abs(b.amount).toFixed(2);
    return `
      <div class="balance-card glass" style="margin-bottom: 12px; padding: 16px; border-radius: 16px;">
        <div class="balance-info" style="display: flex; justify-content: space-between; align-items: center;">
          <div class="balance-name" style="font-weight: 600; font-size: 15px;">${b.name}</div>
          <div class="balance-amount" style="text-align: right;">
            <div style="font-size: 11px; color: var(--text-hint); text-transform: uppercase; letter-spacing: 0.5px;">${text}</div>
            <div style="color: ${color}; font-weight: 700; font-size: 16px;">${b.currency} ${amountStr}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="balances-container" style="margin-top: 24px;">${html}</div>`;
}



// ─── Activity Report ───────────────────────

let currentActivityData = [];
let activityObserver = null;
let activityHasMore = true;

async function fetchActivityData() {
  const container = document.getElementById('activity-list');
  container.innerHTML = '<div class="usage-loading"><span class="spinner"></span></div>';
  document.getElementById('activity-search').value = '';
  
  state.isLoadingMore = false;
  currentActivityData = [];
  activityHasMore = true;

  try {
    const data = await api('expenses?limit=100');
    currentActivityData = (data.expenses || []).filter(e => !e.deleted_at);
    activityHasMore = (data.expenses || []).length >= 100;
    renderActivity(currentActivityData);
    if (activityHasMore) updateActivityFooter();
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Failed to load activity</div>';
    console.error(err);
  }
}

async function loadMoreActivity() {
  if (state.isLoadingMore || !activityHasMore) return;
  
  state.isLoadingMore = true;
  const container = document.getElementById('activity-list');
  const sentinel = document.getElementById('activity-sentinel');
  if (sentinel) sentinel.innerHTML = '<span class="spinner"></span>';
  
  const lastExpense = currentActivityData[currentActivityData.length - 1];
  if (!lastExpense || !lastExpense.date) {
    activityHasMore = false;
    if (sentinel) sentinel.remove();
    state.isLoadingMore = false;
    return;
  }

  try {
    const data = await api(`expenses?limit=100&dated_before=${lastExpense.date}`);
    const expensesBatch = data.expenses || [];
    const filteredExpenses = expensesBatch.filter(e => !e.deleted_at);
    
    // Deduplicate by ID
    const existingIds = new Set(currentActivityData.map(e => e.id));
    const newExpenses = filteredExpenses.filter(e => !existingIds.has(e.id));

    if (newExpenses.length > 0) {
      currentActivityData = [...currentActivityData, ...newExpenses];
      
      const userId = state.currentUser?.id;
      let listContainer = container.querySelector('.activity-container');
      
      // Filter new items against search term
      const term = document.getElementById('activity-search').value.toLowerCase();
      const displayExpenses = term ? newExpenses.filter(exp => matchesSearch(exp, term)) : newExpenses;
      
      if (displayExpenses.length > 0) {
        const newHtml = displayExpenses.map(exp => createActivityCardHtml(exp, userId)).join('');
        
        if (!listContainer) {
          // Recreate container if it was removed by "No matching activity" empty state
          container.innerHTML = `<div class="activity-container">${newHtml}</div>`;
          updateActivityFooter();
        } else {
          listContainer.insertAdjacentHTML('beforeend', newHtml);
        }
      }
    }
    
    // Check original batch length to decide if there are more
    if (expensesBatch.length < 100) {
      activityHasMore = false;
    }
    
    // Always update footer state (e.g. show Load More or No More)
    updateActivityFooter();
  } catch (err) {
    console.error('Failed to load more activity:', err);
    showToast('Failed to load more activity', 'error');
    const sentinel = document.getElementById('activity-sentinel');
    if (sentinel) sentinel.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="loadMoreActivity()">Retry loading next 100 expenses</button>';
  } finally {
    state.isLoadingMore = false;
  }
}

function updateActivityFooter() {
  const container = document.getElementById('activity-list');
  let sentinel = document.getElementById('activity-sentinel');
  
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'activity-sentinel';
    sentinel.className = 'activity-sentinel';
    container.appendChild(sentinel);
  }

  if (activityHasMore) {
    sentinel.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="loadMoreActivity()">Load next 100 expenses</button>';
  } else if (currentActivityData.length > 0) {
    sentinel.innerHTML = '<div class="empty-state">No more expenses to load</div>';
  } else {
    sentinel.innerHTML = '';
  }
}

function renderActivity(expenses) {
  const container = document.getElementById('activity-list');

  if (!expenses || expenses.length === 0) {
    container.innerHTML = '<div class="empty-state">No matching activity</div>';
    // If searching, we still want to allow loading more from server
    updateActivityFooter();
    return;
  }

  const userId = state.currentUser?.id;
  const html = expenses.map(exp => createActivityCardHtml(exp, userId)).join('');

  container.innerHTML = `<div class="activity-container">${html}</div>`;
  
  // Ensure footer is at the end
  updateActivityFooter();
}

function createActivityCardHtml(exp, userId) {
  if (exp.deleted_at) return '';
  
  let actionText = '';
  let actionColor = 'var(--text)';
  
  if (exp.payment) {
    actionText = 'Payment';
    actionColor = 'var(--text-dim)';
  } else {
    const userShare = (exp.users || []).find((u) => u.user_id === userId || u.user?.id === userId);
    const paid = parseFloat(userShare?.paid_share || 0);
    const owed = parseFloat(userShare?.owed_share || 0);
    
    if (paid > 0 && owed > 0 && paid !== owed) {
      actionText = `You paid ${exp.currency_code} ${paid.toFixed(2)}`;
    } else if (paid > 0 && owed === 0) {
      actionText = `You lent ${exp.currency_code} ${paid.toFixed(2)}`;
      actionColor = 'var(--green)';
    } else if (paid === 0 && owed > 0) {
      actionText = `You borrowed ${exp.currency_code} ${owed.toFixed(2)}`;
      actionColor = 'var(--red)';
    } else if (paid === owed && paid > 0) {
      actionText = `You paid for yourself`;
      actionColor = 'var(--text-dim)';
    } else {
      actionText = 'Not involved';
      actionColor = 'var(--text-dim)';
    }
  }

  const dateStr = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `
    <div class="activity-card">
      <div class="activity-date">
        <span class="act-day">${dateStr.split(' ')[1]}</span>
        <span class="act-month">${dateStr.split(' ')[0]}</span>
      </div>
      <div class="activity-details">
        <div class="activity-desc">${exp.description}</div>
        <div class="activity-group">${exp.group_id ? 'Group Expense' : 'Non-group'}</div>
      </div>
      <div class="activity-amount" style="color: ${actionColor}">
        ${actionText}
      </div>
    </div>
  `;
}

function filterActivity() {
  const term = document.getElementById('activity-search').value.toLowerCase();
  if (!term) {
    renderActivity(currentActivityData);
    return;
  }

  const filtered = currentActivityData.filter(exp => matchesSearch(exp, term));
  renderActivity(filtered);
}

function matchesSearch(exp, term) {
  if (exp.description && exp.description.toLowerCase().includes(term)) return true;
  if (exp.category && exp.category.name && exp.category.name.toLowerCase().includes(term)) return true;
  for (let u of (exp.users || [])) {
    if (u.user && u.user.first_name && u.user.first_name.toLowerCase().includes(term)) return true;
    if (u.user && u.user.last_name && u.user.last_name.toLowerCase().includes(term)) return true;
  }
  return false;
}
