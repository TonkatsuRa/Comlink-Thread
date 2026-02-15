document.addEventListener('DOMContentLoaded', () => {
  const aliases = document.querySelector('#alias-select');
  const addUserBtn = document.querySelector('#add-user-btn');
  const deleteUserBtn = document.querySelector('#delete-user-btn');
  const userInputElement = document.querySelector('#alias-input');
  const messageInputElement = document.querySelector('[data-editor]');
  const alignmentSelect = document.querySelector('#alignment-select');
  const profilePicInput = document.querySelector('#profile-pic-input');
  const sendMessageBtn = document.querySelector('#send-message-btn');

  let users = JSON.parse(localStorage.getItem('users')) || [{ name: 'Admin', profilePicture: '' }];

  addUserBtn.addEventListener('click', () => {
    const userName = userInputElement.value.trim();
    const file = profilePicInput.files[0];

    if (userName && !getUserByName(userName)) {
      if (file) {
        const reader = new FileReader();
        reader.onloadend = function () {
          const profilePicURL = reader.result;
          users.push({ name: userName, profilePicture: profilePicURL });
          updateUserList();
          saveUsers();
          userInputElement.value = '';
          profilePicInput.value = '';
        }
        reader.readAsDataURL(file);
      } else {
        users.push({ name: userName, profilePicture: '' });
        updateUserList();
        saveUsers();
        userInputElement.value = '';
        profilePicInput.value = '';
      }
    }
  });

  deleteUserBtn.addEventListener('click', () => {
    const userName = aliases.value;
    const userIndex = users.findIndex((user) => user.name === userName);

    if (userIndex > -1 && userName !== 'Admin') {
      users.splice(userIndex, 1);
      updateUserList();
      saveUsers();
    }
  });

  function updateUserList() {
    aliases.innerHTML = '';
    users.forEach((user) => {
      const option = document.createElement('option');
      option.value = user.name;
      option.textContent = user.name;
      aliases.appendChild(option);
    });
  }
document.addEventListener('DOMContentLoaded', () => {
  const aliases = document.querySelector('#alias-select');
  const addUserBtn = document.querySelector('#add-user-btn');
  const deleteUserBtn = document.querySelector('#delete-user-btn');
  const userInputElement = document.querySelector('#alias-input');
  const messageInputElement = document.querySelector('[data-editor]');
  const alignmentSelect = document.querySelector('#alignment-select');
  const profilePicInput = document.querySelector('#profile-pic-input');
  const sendMessageBtn = document.querySelector('#send-message-btn');
  const clearMessageBtn = document.querySelector('#clear-message-btn');
  const clearThreadBtn = document.querySelector('#clear-thread-btn');
  const statusMessage = document.querySelector('#status-message');
  const messageCount = document.querySelector('#message-count');

  let users = JSON.parse(localStorage.getItem('users')) || [{ name: 'Admin', profilePicture: '' }];
  let messages = JSON.parse(localStorage.getItem('messages')) || [];
  let messageIdCounter = Number(localStorage.getItem('messageIdCounter')) || 0;
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

  const STATUS_TIMEOUT_MS = 3000;
  let statusTimeout;

  const setStatus = (message, isError = false) => {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? '#ff9f9f' : 'rgba(255, 255, 255, 0.8)';
    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }
    if (message) {
      statusTimeout = setTimeout(() => {
        statusMessage.textContent = '';
      }, STATUS_TIMEOUT_MS);
    }
  };

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

    if (userName && !getUserByName(userName)) {
      if (file) {
        const reader = new FileReader();
        reader.onloadend = function () {
          const profilePicURL = reader.result;
          users.push({ name: userName, profilePicture: profilePicURL });
          updateUserList();
          saveUsers();
          setStatus(`Added ${userName} to the roster.`);
          userInputElement.value = '';
          profilePicInput.value = '';
        }
        reader.readAsDataURL(file);
      } else {
        users.push({ name: userName, profilePicture: '' });
        updateUserList();
        saveUsers();
        setStatus(`Added ${userName} to the roster.`);
        userInputElement.value = '';
        profilePicInput.value = '';
      }
    }
  });

  deleteUserBtn.addEventListener('click', () => {
    const userName = aliases.value;
    const userIndex = users.findIndex((user) => user.name === userName);

    if (userIndex > -1 && userName !== 'Admin') {
      users.splice(userIndex, 1);
      updateUserList();
      saveUsers();
      setStatus(`Removed ${userName} from the roster.`);
    } else if (userName === 'Admin') {
      setStatus('Admin cannot be removed.', true);
    } else {
      setStatus('Select a user to delete.', true);
    }
  });

  function updateUserList() {
    const currentSelection = aliases.value;
    aliases.innerHTML = '<option value="">Select User...</option>';
    users.forEach((user) => {
      const option = document.createElement('option');
      option.value = user.name;
      option.textContent = user.name;
      aliases.appendChild(option);
    });
    if (currentSelection) {
      aliases.value = currentSelection;
    }
    updateButtonStates();
  }

  function getUserByName(name) {
    return users.find((user) => user.name === name);
  }

  function saveUsers() {
    localStorage.setItem('users', JSON.stringify(users));
  }

  sendMessageBtn.addEventListener('click', () => {
    const userName = aliases.value;
    const user = getUserByName(userName);
    if (!user) {
      alert('User not found');
      return;
    }

    const messageText = bbCodeToHTML(messageInputElement.value.trim());
    const alignment = alignmentSelect.value;
    const profilePicURL = user.profilePicture;

    if (messageText) {
      createMessage(userName, profilePicURL, messageText, alignment);
      messageInputElement.value = '';
    }
  });

  function createMessage(userName, profilePicURL, messageText, alignment) {
    const message = document.createElement('div');
    message.classList.add('message', `message-${alignment}`);

    const messageBox = document.createElement('div');
    messageBox.classList.add('message-box');

    const profilePic = document.createElement('img');
    profilePic.classList.add('profile-pic');
    profilePic.src = profilePicURL;
    profilePic.style.width = '75px';
    profilePic.style.height = '75px';
  function saveUsers() {
    localStorage.setItem('users', JSON.stringify(users));
  }

  function saveMessages() {
    localStorage.setItem('messages', JSON.stringify(messages));
    localStorage.setItem('messageIdCounter', String(messageIdCounter));
    messageCount.textContent = String(messages.length);
  }

  function updateButtonStates() {
    sendMessageBtn.disabled = !aliases.value;
  }

  sendMessageBtn.addEventListener('click', () => {
    const userName = aliases.value;
    const user = getUserByName(userName);
    if (!user) {
      setStatus('Select a user before sending a message.', true);
      return;
    }

    const rawMessageText = messageInputElement.value.trim();
    const alignment = alignmentSelect.value;
    const profilePicURL = user.profilePicture;

    if (rawMessageText) {
      const newMessage = {
        id: ++messageIdCounter,
        userName,
        profilePicURL,
        rawText: rawMessageText,
        alignment,
        timestamp: new Date().toLocaleTimeString(),
      };
      messages.push(newMessage);
      createMessage(newMessage);
      saveMessages();
      messageInputElement.value = '';
      setStatus('Message sent.');
    } else {
      setStatus('Draft is empty.', true);
    }
  });

  clearMessageBtn.addEventListener('click', () => {
    messageInputElement.value = '';
    setStatus('Draft cleared.');
  });

  clearThreadBtn.addEventListener('click', () => {
    if (!messages.length) {
      setStatus('Thread is already empty.', true);
      return;
    }
    messages = [];
    document.querySelector('.comlink-container').innerHTML = '';
    saveMessages();
    setStatus('Thread cleared.');
  });

  messageInputElement.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      sendMessageBtn.click();
    }
  });

  aliases.addEventListener('change', updateButtonStates);

  function createMessage({ id, userName, profilePicURL, rawText, alignment, timestamp }) {
    const message = document.createElement('div');
    message.classList.add('message', `message-${alignment}`);
    message.dataset.messageId = id;

    const messageBox = document.createElement('div');
    messageBox.classList.add('message-box');

    const profilePic = document.createElement('img');
    profilePic.classList.add('profile-pic');
    profilePic.src = profilePicURL || defaultAvatar;
    profilePic.style.width = '75px';
    profilePic.style.height = '75px';

    const arrowContainer = document.createElement('div');
    arrowContainer.classList.add('arrow-container', `arrow-container-${alignment}`);

    const moveUpBtn = document.createElement('button');
    moveUpBtn.classList.add('move-up-btn');
    moveUpBtn.textContent = '↑';
      moveUpBtn.onclick = () => {
        if (message.previousElementSibling) {
          message.parentElement.insertBefore(message, message.previousElementSibling);
        }
      };

      const moveDownBtn = document.createElement('button');
  moveDownBtn.classList.add('move-down-btn');
  moveDownBtn.textContent = '↓';
  moveDownBtn.onclick = () => {
    if (message.nextElementSibling) {
      message.parentElement.insertBefore(message.nextElementSibling, message);
    }
  };
      moveUpBtn.onclick = () => {
        if (message.previousElementSibling) {
          message.parentElement.insertBefore(message, message.previousElementSibling);
          moveMessage(id, -1);
        }
      };

      const moveDownBtn = document.createElement('button');
  moveDownBtn.classList.add('move-down-btn');
  moveDownBtn.textContent = '↓';
  moveDownBtn.onclick = () => {
    if (message.nextElementSibling) {
      message.parentElement.insertBefore(message.nextElementSibling, message);
      moveMessage(id, 1);
    }
  };

  arrowContainer.appendChild(moveUpBtn);
  arrowContainer.appendChild(moveDownBtn);

  if (alignment === 'left') {
    messageBox.appendChild(arrowContainer);
    if (userName !== 'Admin') {
      messageBox.appendChild(profilePic);
    }
  }

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');
  if (alignment === 'left') {
    messageContent.setAttribute('data-augmented-ui', 'bl-clip tr-2-clip-x');
  }
  if (alignment === 'right') {
    messageContent.setAttribute('data-augmented-ui', 'br-clip tl-2-clip-x');
  }

  if (userName !== 'Admin') {␍␊
    const messageInfo = document.createElement('div');␍␊
    messageInfo.classList.add('message-info');␍␊
␍␊
    const userNameSpan = document.createElement('span');␍␊
    userNameSpan.classList.add('name');␍␊
    userNameSpan.textContent = userName;␍␊
␍␊
    const timestampSpan = document.createElement('span');␍␊
    timestampSpan.classList.add('timestamp');␍␊
    timestampSpan.textContent = new Date().toLocaleTimeString();
␍␊
    const messageTextP = document.createElement('p');␍␊
    messageTextP.innerHTML = messageText;
␍␊
    messageInfo.appendChild(userNameSpan);␍␊
    messageInfo.appendChild(timestampSpan);␍␊
  if (userName !== 'Admin') {␊
    const messageInfo = document.createElement('div');␊
    messageInfo.classList.add('message-info');␊
␊
    const userNameSpan = document.createElement('span');␊
    userNameSpan.classList.add('name');␊
    userNameSpan.textContent = userName;␊
␊
    const timestampSpan = document.createElement('span');␊
    timestampSpan.classList.add('timestamp');␊
    timestampSpan.textContent = timestamp || new Date().toLocaleTimeString();
␊
    const messageTextP = document.createElement('p');␊
    messageTextP.innerHTML = bbCodeToHTML(rawText);
␊
    messageInfo.appendChild(userNameSpan);␊
    messageInfo.appendChild(timestampSpan);␊

    messageContent.appendChild(messageInfo);
    messageContent.appendChild(messageTextP);
  } else {
    messageContent.style.background = 'transparent';
    messageContent.style.border = 'none';
    messageContent.style.boxShadow = 'none';
    messageContent.style.outline = 'none';␍␊
    messageContent.style.borderColor = 'transparent';␍␊
    messageContent.style.color = '#000';␍␊
    messageContent.setAttribute('data-augmented-ui', 'none');␍␊
    messageContent.innerHTML = messageText;
    message.classList.add('admin-message');␍␊
    messageContent.classList.add('admin-message-content');␍␊
  }␍␊
    messageContent.style.outline = 'none';␊
    messageContent.style.borderColor = 'transparent';␊
    messageContent.style.color = '#000';␊
    messageContent.setAttribute('data-augmented-ui', 'none');␊
    messageContent.innerHTML = bbCodeToHTML(rawText);
    message.classList.add('admin-message');␊
    messageContent.classList.add('admin-message-content');␊
  }␊

  messageBox.appendChild(messageContent);

  if (alignment === 'right') {
    if (userName !== 'Admin') {
      messageBox.appendChild(profilePic);
    }
    messageBox.appendChild(arrowContainer);
  }

  message.appendChild(messageBox);

  const deleteBtn = document.createElement('button');
  deleteBtn.classList.add('delete-btn');
  deleteBtn.textContent = 'x';
  deleteBtn.onclick = () => {
    message.remove();
  };

  messageBox.appendChild(deleteBtn);

  document.querySelector('.comlink-container').appendChild(message);
}

function bbCodeToHTML(text) {
  const bbCodes = [
    { regex: /\[b\](.*?)\[\/b\]/g, replacement: '<strong>$1</strong>' },
  const deleteBtn = document.createElement('button');
  deleteBtn.classList.add('delete-btn');
  deleteBtn.textContent = 'x';
  deleteBtn.onclick = () => {
    message.remove();
    messages = messages.filter((item) => item.id !== id);
    saveMessages();
    setStatus('Message removed.');
  };

  messageBox.appendChild(deleteBtn);

  document.querySelector('.comlink-container').appendChild(message);
}

function moveMessage(id, direction) {
  const index = messages.findIndex((item) => item.id === id);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= messages.length) {
    return;
  }
  const [message] = messages.splice(index, 1);
  messages.splice(targetIndex, 0, message);
  saveMessages();
}

function bbCodeToHTML(text) {
  const bbCodes = [
    { regex: /\[b\](.*?)\[\/b\]/g, replacement: '<strong>$1</strong>' },
    { regex: /\[i\](.*?)\[\/i\]/g, replacement: '<em>$1</em>' },
    { regex: /\[u\](.*?)\[\/u\]/g, replacement: '<u>$1</u>' },
    { regex: /\[s\](.*?)\[\/s\]/g, replacement: '<strike>$1</strike>' },
    { regex: /\[left\](.*?)\[\/left\]/g, replacement: '<div style="text-align: left">$1</div>' },
    { regex: /\[center\](.*?)\[\/center\]/g, replacement: '<div style="text-align: center">$1</div>' },
    { regex: /\[right\](.*?)\[\/right\]/g, replacement: '<div style="text-align: right">$1</div>' },
  { regex: /\[color=(.*?)\](.*?)\[\/color\]/g, replacement: '<span style="color:$1">$2</span>' },
  { regex: /\[size=(.*?)\](.*?)\[\/size\]/g, replacement: '<span style="font-size:$1px">$2</span>' },
  { regex: /\[url\](.*?)\[\/url\]/g, replacement: '<a href="$1" target="_blank">$1</a>' },
  { regex: /\[url=(.*?)\](.*?)\[\/url\]/g, replacement: '<a href="$1" target="_blank">$2</a>' },
  { regex: /\[img\](.*?)\[\/img\]/g, replacement: '<img src="$1" alt="Image" />' },
  { regex: /\[quote\](.*?)\[\/quote\]/g, replacement: '<blockquote>$1</blockquote>' },
  { regex: /\[list\](.*?)\[\/list\]/g, replacement: '<ul>$1</ul>' },
  { regex: /\[\*\](.*?)\[\/\*\]/g, replacement: '<li>$1</li>' },
];

    return bbCodes.reduce((acc, bbCode) => {
      return acc.replace(bbCode.regex, bbCode.replacement);
    }, text);
  }

  function loadUsers() {
    updateUserList();
  }

  loadUsers();
});
  }

  function loadUsers() {
    updateUserList();
  }

  function loadMessages() {
    messages.forEach((message) => createMessage(message));
    saveMessages();
  }

  loadUsers();
  loadMessages();
  updateButtonStates();
});

