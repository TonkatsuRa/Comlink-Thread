document.addEventListener('DOMContentLoaded', () => {
  const aliases = document.querySelector('#alias-select');
  const addUserBtn = document.querySelector('#add-user-btn');
  const deleteUserBtn = document.querySelector('#delete-user-btn');
  const userInputElement = document.querySelector('#alias-input');
  const messageInputElement = document.querySelector('#message-input');
  const alignmentSelect = document.querySelector('#alignment-select');
  const profilePicInput = document.querySelector('#profile-pic-input');
  const sendMessageBtn = document.querySelector('#send-message-btn');
  const timestampInput = document.querySelector('#timestamp-input');

  let users = [];

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
          saveUsers(); // Save the users array to localStorage
          userInputElement.value = '';
          profilePicInput.value = '';
        }
        reader.readAsDataURL(file);
      } else {
        users.push({ name: userName, profilePicture: '' });
        updateUserList();
        saveUsers(); // Save the users array to localStorage
        userInputElement.value = '';
        profilePicInput.value = '';
      }
    }
  });

  deleteUserBtn.addEventListener('click', () => {
    const userName = aliases.value;
    const userIndex = users.findIndex((user) => user.name === userName);

    if (userIndex > -1) {
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

  sendMessageBtn.addEventListener('click', () => {
    const userName = aliases.value;
    const user = getUserByName(userName);
    if (!user) {
      alert('User not found');
      return;
    }

    const messageText = messageInputElement.value.trim();
    const alignment = alignmentSelect.value;
    const profilePicURL = user.profilePicture;
    const timestampText = timestampInput.value;

    if (messageText) {
      createMessage(userName, profilePicURL, messageText, alignment, timestampText);
      messageInputElement.value = '';
      timestampInput.value = '';
    }
  });

  function createMessage(name, profilePicURL, text, alignment, timestampText) {
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
      messageBox.appendChild(profilePic);
    }

    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    if (alignment === 'left') {
      messageContent.setAttribute('data-augmented-ui', 'bl-clip tr-2-clip-x');
    }
    if (alignment === 'right') {
      messageContent.setAttribute('data-augmented-ui', 'br-clip tl-2-clip-x');
    }

    const messageInfo = document.createElement('div');
    messageInfo.classList.add('message-info');

    const userName = document.createElement('span');
    userName.classList.add('name');
    userName.textContent = name;

    const timestamp = document.createElement('span');
    timestamp.classList.add('timestamp');
    timestamp.textContent = timestampText || new Date().toLocaleTimeString();

    const messageText = document.createElement('p');
    messageText.textContent = text;

    messageInfo.appendChild(userName);
    messageInfo.appendChild(timestamp);

    messageContent.appendChild(messageInfo);
    messageContent.appendChild(messageText);

    messageBox.appendChild(messageContent);

    if (alignment === 'right') {
      messageBox.appendChild(profilePic);
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

  // Save Users Function //
  function saveUsers() {
    localStorage.setItem('users', JSON.stringify(users));
  }

  function loadUsers() {
    const storedUsers = localStorage.getItem('users');
    if (storedUsers) {
      users = JSON.parse(storedUsers);
      updateUserList();
    }
  }

  // ====== END OF THE SCRIPT ===== //
  loadUsers();
});
