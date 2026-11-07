/*
  Настройки страницы «Киношные совместные просмотры».

  На своём хостинге отметки хранятся в той же базе Firebase, что и голосование Киношной, в отдельной ветке together.
  Чтобы база пустила туда запись, добавьте правила из README.md. Пока правил нет,
  страница работает в демо-режиме: отметки видны только в вашем браузере.
  На claude.ai (artifact.html) Firebase не используется: там своя база страницы.
*/
window.TOGETHER_CONFIG = {
  // Название сбора. Поменяйте (например на "2026-12"), чтобы начать с нуля.
  pollId: "2026-11",

  // Сколько серых кружков показывать у каждого фильма, пока желающих меньше. На телефоне кружки крупнее, поэтому их меньше.
  slots: 8,
  slotsPhone: 6,

  // Сколько человек нужно, чтобы кураторы собрали группу на фильм. Под каждым фильмом видно «2 из 5» и полоску прогресса.
  groupSize: 5,

  firebase: {
    apiKey: "AIzaSyCsDkUKyD5MsrFk4wjQMQennsXklNWk7KM",
    authDomain: "twiglles-kinoshnaya.firebaseapp.com",
    databaseURL: "https://twiglles-kinoshnaya-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "twiglles-kinoshnaya",
    appId: "1:1060450656852:web:30a97a410ad612f52803c1"
  }
};
