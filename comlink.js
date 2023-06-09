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

  if (userName !== 'Admin') {
    const messageInfo = document.createElement('div');
    messageInfo.classList.add('message-info');

    const userNameSpan = document.createElement('span');
    userNameSpan.classList.add('name');
    userNameSpan.textContent = userName;

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('timestamp');
    timestampSpan.textContent = new Date().toLocaleTimeString();

    const messageTextP = document.createElement('p');
    messageTextP.innerHTML = messageText;

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
    messageContent.innerHTML = messageText;
    message.classList.add('admin-message');
    messageContent.classList.add('admin-message-content');
  }

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

