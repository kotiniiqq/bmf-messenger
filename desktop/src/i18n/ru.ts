/**
 * Every string the interface shows, in Russian.
 *
 * Grouped by the screen that shows it, so a key is findable from the UI without
 * grepping. `{name}`-shaped holes are filled by `t(key, params)`.
 *
 * Nothing here is imported for its value at module load — components call `t()`
 * at render time, which is what lets a second language be a second file rather
 * than another sweep through the components.
 */
export const ru = {
  chat: {
    searchPlaceholder: 'Поиск чатов… (Ctrl+K — везде)',
    dmFallback: 'Личный чат',
    chatFallback: 'Чат',
    draft: 'Черновик:',
    noMessages: 'Пока нет сообщений',
    later: '⏱ позже',
    emptyFolder: 'В этой папке пока пусто',
    pickChat: 'Выберите чат',
    pickChatHint: 'Слева список ваших переписок',
    loadOlder: 'Показать более ранние',

    folder: {
      all: 'Все',
      unread: 'Непрочитанные',
      later: 'Позже',
      work: 'Работа',
      personal: 'Личное',
    },

    presence: {
      offline: 'не в сети',
      justNow: 'был(а) только что',
      minutesAgo: 'был(а) {minutes} мин назад',
      today: 'был(а) сегодня',
      longAgo: 'был(а) давно',
      online: 'в сети',
      typing: 'печатает…',
      dm: 'личная переписка',
      channel: 'канал',
      group: 'группа',
      /** The header counts people once the roster is known; the words above are what it says until then. */
      memberWord: { one: 'участник', few: 'участника', many: 'участников' },
      subscriberWord: { one: 'подписчик', few: 'подписчика', many: 'подписчиков' },
      members: '{count} {word}',
      membersOnline: '{count} {word}, {online} в сети',
    },

    message: {
      unreadable: 'Сообщение недоступно на этом устройстве',
      forwarded: 'Пересланное сообщение',
      reply: 'Ответ',
      deleted: 'Сообщение удалено',
      attachment: 'Вложение',
      imageFailed: 'Не удалось загрузить изображение',
      bytes: 'Б',
      kilobytes: 'КБ',
      megabytes: 'МБ',
      scheduledPrefix: 'отправится',
      pinned: 'закреплено',
      edited: 'изменено',
    },

    menu: {
      reply: 'Ответить',
      forward: 'Переслать',
      copy: 'Копировать текст',
      edit: 'Изменить',
      pin: 'Закрепить',
      unpin: 'Открепить',
      delete: 'Удалить',
      pinned: 'Сообщение закреплено',
      unpinned: 'Сообщение откреплено',
      pinDenied: 'Закреплять может только модератор',
      deleted: 'Сообщение удалено',
    },

    header: {
      audioCall: 'Аудиозвонок',
      videoCall: 'Видеозвонок',
      callsUnavailable: 'Звонки недоступны на этом сервере',
      defer: 'Отложить прочтение',
      deferred: 'Отложено на потом',
      undeferred: 'Вернули в список',
      info: 'Информация о чате',
    },

    viewer: {
      save: 'Сохранить',
      saving: 'Сохраняем…',
    },

    /** Right-click on a row in the chat list, and the confirmation behind it. */
    delete: {
      menuItem: 'Удалить чат',
      menuItemLeave: 'Выйти и удалить',
      title: 'Удалить чат?',
      explainClear:
        'Переписка «{title}» исчезнет из списка, и старые сообщения больше не будут ' +
        'вам видны — ни в чате, ни в поиске. Вернуть их будет неоткуда. ' +
        'У собеседника его копия останется: чужую переписку мы не трогаем.',
      explainLeave:
        'Вы выйдете из «{title}» и перестанете получать сообщения. Всё, что вы уже ' +
        'написали, останется у остальных участников — это было адресовано им.',
      confirmClear: 'Удалить',
      confirmLeave: 'Выйти и удалить',
      cleared: 'Чат удалён',
      left: 'Вы вышли из чата',
      failed: 'Не удалось удалить чат',
    },

    /** The panel behind the header: who is in this chat. */
    info: {
      titleGroup: 'О группе',
      titleChannel: 'О канале',
      titleDm: 'Профиль',
      members: 'Участники',
      admins: 'Администраторы',
      you: 'ты',
      roleOwner: 'Владелец',
      roleAdmin: 'Администратор',
      roleMember: 'Участник',
      adminBadge: 'админ',
      loading: 'Загружаем участников…',
    },

    privacy: {
      desktopOnly: 'Режим приватности работает только в десктопном приложении',
      proposed: 'Предложили режим приватности — ждём подтверждения',
      proposeFailed: 'Не удалось предложить режим приватности',
      on: 'Режим приватности включён',
      off: 'Режим приватности выключен',
      changeFailed: 'Не удалось изменить режим',
      buttonOn: 'Приватный режим включён',
      buttonProposed: 'Режим приватности предложен',
      buttonOffer: 'Предложить режим приватности',
      barOn: 'Режим приватности',
      barWaiting: 'Ждём ответа собеседника',
      barOffered: 'Предложен режим приватности',
      textOn:
        'Сообщения шифруются на устройствах. История не синхронизируется между устройствами' +
        ' и не восстанавливается — на другом устройстве этот чат будет пуст.',
      textWaiting: 'Пока собеседник не подтвердит, сообщения идут обычным образом.',
      textOffered:
        'Собеседник предлагает шифровать переписку. История перестанет синхронизироваться' +
        ' между устройствами.',
      accept: 'Принять',
      turnOff: 'Выключить',
      decline: 'Отклонить',
    },

    pin: {
      title: 'Закреплённое сообщение',
      counted: 'Закреплённое {at} из {total}',
      next: 'Следующее закреплённое',
      unpin: 'Открепить',
    },

    compose: {
      reply: 'Ответ',
      edit: 'Редактирование',
      cancel: 'Отменить',
      placeholder: 'Написать сообщение...',
      channelPlaceholder: 'Опубликовать пост...',
      emoji: 'Эмодзи',
      stickers: 'Стикеры',
      attach: 'Прикрепить',
      attachFailed: 'Не удалось отправить файл',
      send: 'Отправить · правый клик — отправить позже',
      scheduledAt: 'Отправится: {when}',
      willSend: 'Отправится {when}',
    },

    schedule: {
      inTenMinutes: 'Через 10 минут',
      inAnHour: 'Через час',
      todayAtSix: 'Сегодня в 18:00',
      tomorrowAtNine: 'Завтра в 9:00',
    },
  },

  common: {
    cancel: 'Отмена',
    close: 'Закрыть',
    save: 'Сохранить',
    edit: 'Изменить',
    delete: 'Удалить',
    remove: 'Убрать',
    open: 'Открыть',
    show: 'Показать',
    back: 'Назад',
    hide: 'Скрыть',
    next: 'Далее',
    create: 'Создать',
    send: 'Отправить',
    loading: 'Загрузка…',
    nothingFound: 'Ничего не найдено',
    copied: 'Текст скопирован',
    copyUnavailable: 'Копирование недоступно',
  },

  nav: {
    menu: 'Меню',
    chats: 'Чаты',
    mail: 'Почта',
    music: 'Музыка',
    notes: 'Заметки',
    profile: 'Профиль',
  },

  window: {
    minimise: 'Свернуть',
    maximise: 'Оконный режим',
    tray: 'Свернуть в трей',
  },

  drawer: {
    profile: 'Мой профиль',
    contacts: 'Контакты',
    calls: 'Звонки',
    newGroup: 'Создать группу',
    newChannel: 'Создать канал',
    updates: 'Проверка обновлений',
    settings: 'Настройки',
    statusAuto: ' · авто',
  },

  cheat: {
    title: 'Горячие клавиши',
    subtitle: 'Аварийный сброс работает всегда, его нельзя перехватить',
  },

  shortcuts: {
    search: 'Поиск и команды',
    cheat: 'Шпаргалка по клавишам',
    night: 'Ночной режим',
    chats: 'Открыть чаты',
    mail: 'Открыть почту',
    music: 'Открыть музыку',
    play: 'Играть / пауза',
    next: 'Следующий трек',
    prev: 'Предыдущий трек',
    settings: 'Настройки',
    reset: 'Аварийный сброс оформления',
  },

  status: {
    on: 'Доступен',
    focus: 'В фокусе',
    call: 'На созвоне',
    away: 'Отошёл',
    dnd: 'Не беспокоить',
    off: 'В отпуске',
  },

  api: {
    uploadFailed: 'Не удалось загрузить файл',
    mediaFailed: 'Не удалось открыть вложение',
  },

  auth: {
    signInFailed: 'Не удалось войти',
    signUpFailed: 'Не удалось зарегистрироваться',
  },

  authScreen: {
    signUpSub: 'Создание аккаунта',
    signInSub: 'Вход в аккаунт',
    loginSignUp: 'Имя пользователя',
    loginSignIn: 'Имя пользователя или почта',
    loginHint: 'только строчные буквы и цифры',
    email: 'Почта',
    password: 'Пароль',
    passwordHint: 'не короче 10 символов',
    remember: 'Запомнить меня',
    rememberOn: 'Не спрашивать пароль при следующем запуске',
    rememberOff: 'Выйти при закрытии приложения — для чужого компьютера',
    busy: 'Подождите…',
    signUp: 'Зарегистрироваться',
    signIn: 'Войти',
    haveAccount: 'Уже есть аккаунт? ',
    noAccount: 'Нет аккаунта? ',
    terms:
      'Это тестовая версия. Регистрируясь, вы принимаете условия использования и политику' +
      ' конфиденциальности. Данные тестового периода могут быть удалены, а восстановление' +
      ' пароля пока недоступно.',
  },

  notes: {
    title: 'Заметки',
    backToList: 'К списку',
    untitled: 'Без заголовка',
    emptyNote: 'Пустая заметка',
    newNote: '+ Заметка',
    deleteNote: 'Удалить заметку',
    view: 'Просмотр',
    edit: 'Править',
    allFolders: 'Все',
    loading: 'Загружаю…',
    emptyTitle: 'Заметки пусты.',
    emptyHint: 'Пиши сюда мысли — они видны только тебе.',
    pin: 'Закрепить',
    unpin: 'Открепить',
    titlePlaceholder: 'Заголовок',
    bodyPlaceholder:
      'Пиши как обычно. # заголовок, **жирный**, - список, - [ ] пункт чек-листа',
    loadFailed: 'Не удалось загрузить заметки',
    saveFailed: 'Заметка не сохранилась',
    createFailed: 'Не удалось создать заметку',
    deleteFailed: 'Не удалось удалить заметку',
    pinFailed: 'Не удалось закрепить',
  },

  notify: {
    newMessage: 'Новое сообщение',
    privateMessage: 'Сообщение в приватном режиме',
    attachment: 'Вложение',
    incomingCall: 'Входящий звонок',
    callInApp: 'Звонок в BMF',
  },

  call: {
    micOn: 'Включить микрофон',
    micOff: 'Выключить микрофон',
    stopShare: 'Остановить демонстрацию',
    hangUp: 'Завершить звонок',
    returnTo: 'Вернуться к звонку',
    ongoing: 'Звонок идёт',
    expand: 'Развернуть',
    incoming: 'Входящий звонок',
    video: 'Видеозвонок',
    audio: 'Аудиозвонок',
    incomingSuffix: ' · входящий',
    decline: 'Отклонить',
    answer: 'Ответить',
  },

  callWindow: {
    connecting: 'Соединение…',
    connectingNote: 'Подключаюсь…',
    ongoing: 'Звонок · {elapsed}',
    ringing: 'Звоним…',
    ringingHint: 'Если никто не ответит, звонок завершится сам через минуту.',
    minimise: 'Свернуть',
    maximise: 'Оконный режим',
    toPill: 'Свернуть в таблетку',
    mic: 'Микрофон',
    cam: 'Камера',
    share: 'Демонстрация экрана',
    shareStop: 'Остановить демонстрацию',
    fitWhole: 'Показывать кадр целиком',
    fitFill: 'Заполнять плитку кадром',
    hangUp: 'Завершить',
    screenSuffix: ' · экран',
    micDenied: 'Нет доступа к микрофону — тебя не слышно. Разреши доступ в настройках системы.',
    camDenied: 'Нет доступа к камере — звонок идёт без видео.',
    joinFailed: 'Не удалось подключиться',
    micUnavailable: 'Микрофон недоступен — проверь доступ в настройках системы.',
    camUnavailable: 'Камера недоступна — проверь доступ в настройках системы.',
    windowsFailed: 'Не удалось получить список окон.',
    shareNoAudio: 'Экран виден, но звук системы захватить не удалось — нет monitor-устройства.',
    shareFailed: 'Не удалось начать демонстрацию.',
  },

  palette: {
    placeholder: 'Поиск везде · фильтры: от: в:',
    nothing: 'Ничего не нашлось.',
    filtersHint: 'Фильтры:',
    filterFrom: 'от:мария',
    filterWhere: 'в:чатах',
    groupCommands: 'Команды',
    groupChats: 'Чаты',
    groupMessages: 'Сообщения',
    groupMusic: 'Музыка',
    appearance: 'Кастомизация',
    appearanceSub: 'Панель, тема, прозрачность',
    openMail: 'Открыть почту',
    openMailSub: 'Раздел почты',
    openMusic: 'Открыть музыку',
    openMusicSub: 'Раздел плеера',
    dmFallback: 'Личный чат',
    noMessages: 'Пока нет сообщений',
    attachment: 'Вложение',
    tagGroup: 'группа',
    tagChannel: 'канал',
    /** Scope prefixes matched against what the user typed after the `в:` filter. */
    scopeChats: 'чат',
    scopeMusic: 'музык',
    /**
     * The filter words themselves are part of the localised interface: a
     * Russian user types `от:`, and another language would spell it its own way.
     */
    prefixFrom: 'от',
    prefixWhere: 'в',
    prefixHas: 'есть',
  },

  appearance: {
    layout: 'Расположение панели разделов',
    layoutBottom: 'Снизу слева',
    layoutRail: 'Слева',
    layoutTop: 'В шапке',
    layoutTopToast: 'Панель разделов — в шапке',
    layoutRailToast: 'Панель разделов — слева',
    layoutBottomToast: 'Панель разделов — снизу слева',

    theme: 'Тема',
    light: 'Светлая',
    dark: 'Тёмная',
    lightToast: 'Светлая тема',
    darkToast: 'Тёмная тема',

    opacity: 'Прозрачность окна',
    opacityHint: 'Окно приложения полупрозрачное — под ним видно рабочий стол.',
    blur: 'Сила размытия',

    wallpaperName: 'Фон окна',
    chatBgName: 'Фон чата',
    imageSet: '{name} установлен',
    imageTooBig: '{name} установлен, но слишком велик, чтобы сохраниться до перезапуска',
    ownWallpaper: 'Свои обои под окном',
    resetWallpaper: 'Вернуть стандартные обои',
    defaultWallpaper: 'Стандартные обои',

    market: 'Маркет тем',
    openMarket: 'Открыть маркет тем',
    openMarketSub: 'Готовые оформления, импорт и экспорт кода',

    rescueBefore: 'Если оформление стало нечитаемым — ',
    rescueAfter: ' сбрасывает всё к стандартному виду.',
    resetNow: 'Сбросить оформление сейчас',

    accent: 'Акцентный цвет',
    accentToast: 'Акцент: {colour}',

    sections: 'Разделы и чаты',
    mail: 'Почта',
    mailHint: 'Кнопка почты в панели',
    music: 'Музыка',
    musicHint: 'Кнопка плеера в панели',
    shown: 'показана',
    hidden: 'скрыта',
    sectionToast: '{section}: {state}',

    chatBg: 'Фон чата',
    chatBgPick: 'Нажми, чтобы выбрать фото',
    chatBgRemove: 'Убрать фон чата',
    chatBgRemoved: 'Фон чата убран',
  },

  contacts: {
    title: 'Контакты',
    searchPlaceholder: 'Имя пользователя, минимум 2 символа',
    hint: 'Введите имя пользователя, чтобы найти собеседника',
    none: 'Никого не нашлось',
    openFailed: 'Не удалось открыть чат',
    add: 'Добавить в контакты',
    rename: 'Изменить имя',
    remove: 'Убрать из контактов',
    removed: 'Убрали из контактов',
    saved: 'Сохранили',
    saveFailed: 'Не удалось сохранить',
    localName: 'Как называть этого человека',
    localNameHint: 'Имя видите только вы. Собеседник о нём не узнает.',
    mine: 'Мои контакты',
    empty: 'Пока никого. Найдите человека по имени пользователя и откройте его профиль.',
    searchLabel: 'Поиск людей',
  },

  forward: {
    title: 'Переслать в...',
    action: 'Переслать',
    actionCount: 'Переслать ({count})',
    currentChat: 'текущий чат',
    dm: 'личный чат',
    group: 'группа',
    chatFallback: 'Личный чат',
  },

  stickers: {
    emoji: 'Эмодзи',
    store: 'Магазин стикеров',
    storeStage: 'Магазин стикеров появится на этапе 5',
    pack: {
      classic: 'Классика',
      work: 'Рабочие',
    },
  },

  mail: {
    compose: 'Написать письмо',
    folders: 'Папки',
    attachment: 'вложение',
    empty: 'Здесь пусто',
    reply: 'Ответить',
    forward: 'Переслать',
    discuss: 'Обсудить в чате',
    stage3: 'Появится на этапе 3',
    mockNotice:
      'Раздел почты — макет. Письма ненастоящие, приём и отправка появятся на этапе 3.',

    folder: {
      inbox: 'Входящие',
      sent: 'Отправленные',
      drafts: 'Черновики',
      spam: 'Спам',
      trash: 'Корзина',
    },

    category: {
      all: 'Все',
      unread: 'Непрочитанные',
      attachment: 'С вложением',
    },

    /** Mock letters. Stage 3 deletes this block along with the mock module. */
    mock: {
      ci: {
        from: 'GitHub',
        subject: 'Сборка bmf-app прошла успешно',
        preview: 'Workflow «Build desktop» завершился без ошибок…',
        body:
          'Workflow «Build desktop» завершился без ошибок.\n\n' +
          'Ветка: main\nАртефакты: BMF-Messenger-Setup-x64.exe, AppImage, deb\n\n' +
          'Это письмо — часть макета почтового раздела.',
        time: '14:22',
      },
      design: {
        from: 'Анна',
        subject: 'Правки по макету',
        preview: 'Посмотри вложение, там второй вариант шапки…',
        body:
          'Посмотри вложение, там второй вариант шапки.\n\n' +
          'Если не подойдёт — сделаю третий, но мне кажется этот ближе к тому,\n' +
          'что обсуждали.',
        time: '11:05',
      },
      host: {
        from: 'VPS Host',
        subject: 'Ответ по обращению #48120',
        preview: 'По вопросу открытия порта 25 сообщаем…',
        body:
          'По вопросу открытия порта 25 сообщаем, что на текущем тарифе\n' +
          'отправка почты недоступна. Требуется переход на тариф от $19.',
        time: 'вчера',
      },
      digest: {
        from: 'Дайджест',
        subject: 'Что нового за неделю',
        preview: 'Семь обновлений, три из них про интерфейс…',
        body: 'Семь обновлений, три из них про интерфейс.',
        time: '28 июля',
      },
    },
  },

  player: {
    dragHint: 'Тяни влево или вправо, чтобы сменить трек',
    expand: 'Развернуть плеер',
    previous: 'Предыдущий',
    next: 'Следующий',
    playPause: 'Играть / пауза',
    shuffle: 'Перемешать',
    shuffleOn: 'Перемешивание вкл',
    shuffleOff: 'Перемешивание выкл',
    repeat: 'Повтор',
    repeatOn: 'Повтор трека вкл',
    repeatOff: 'Повтор выкл',
    volume: 'Громкость: {value}%',
    toChat: 'В чат',
    toChatStage: 'Отправка трека в чат появится на этапе 5',
  },

  music: {
    source: 'Источник',
    scan: 'Сканировать папку',
    library: 'Библиотека',
    playlists: 'Плейлисты',
    allTracks: 'Все треки',
    favourites: 'Избранное',
    playlist: 'Плейлист',
    folder: 'Папка Music\\BMF',
    listen: 'Слушать',
    stage5: 'Появится на этапе 5',
    /** "12 треков · 44 мин" — the count word is chosen by `plural()`. */
    trackWord: { one: 'трек', few: 'трека', many: 'треков' },
    summary: '{count} {word} · {minutes} мин · макет, этап 5',

    /** Mock library. Stage 5 replaces it with a real folder scan. */
    mock: {
      night: { title: 'Ночная смена', artist: 'Тихий этаж', album: 'Дежурство' },
      port: { title: 'Порт 25 закрыт', artist: 'Админы', album: 'Тикет не закрыт' },
      cursor: { title: 'Курсор без OFFSET', artist: 'Postgres Quartet', album: 'Пагинация' },
      redis: { title: 'Redis не отвечает', artist: 'Тихий этаж', album: 'Дежурство' },
      playlistWork: 'Под работу',
      playlistEvening: 'Вечернее',
    },
  },

  callHistory: {
    title: 'Звонки',
    loading: 'Загружаю…',
    failed: 'Не удалось загрузить историю звонков.',
    empty: 'Звонков пока не было.',
    in: 'Входящий',
    out: 'Исходящий',
    missed: 'Пропущенный',
    videoSuffix: ' · видео',
    today: 'сегодня, {time}',
    yesterday: 'вчера, {time}',
  },

  settings: {
    title: 'Настройки',
    appearanceGroup: 'Внешний вид',
    soon: 'Скоро',
    failed: 'Не удалось',

    item: {
      account: 'Аккаунт',
      accountDesc: 'Профиль, пароль, сессии',
      notif: 'Уведомления и звуки',
      notifDesc: 'Когда показывать, громкость',
      mail: 'Почта',
      mailDesc: 'Адрес, подпись, фильтры',
      rules: 'Правила почты',
      rulesDesc: 'Автосортировка входящих',
      music: 'Музыка',
      musicDesc: 'Папка, таймер сна, кроссфейд',
      ai: 'Параметры ИИ',
      aiDesc: 'Ключ, модель, имя и характер',
      update: 'Обновления',
      updateDesc: 'Версия, автозапуск, канал',
      keys: 'Горячие клавиши',
      keysDesc: 'Список сочетаний',
      sounds: 'Звуковые схемы',
      soundsDesc: 'Наборы звуков уведомлений',
      lang: 'Язык интерфейса',
      langDesc: 'Русский',
      custom: 'Кастомизация',
      customDesc: 'Темы, акцент, прозрачность, фон чата',
    },

    account: {
      name: 'Имя',
      username: 'Юзернейм',
      status: 'Статус',
      passwordSection: 'Смена пароля',
      currentPassword: 'Текущий пароль',
      newPassword: 'Новый пароль, не короче 10 символов',
      changePassword: 'Изменить пароль',
      passwordChanged: 'Пароль изменён',
      passwordChangedSessions: 'Пароль изменён, завершено сессий: {count}',
      passwordNote:
        'Смена пароля завершает все остальные сессии. Восстановление недоступно: почтовый порт' +
        ' у провайдера закрыт.',
      sessions: 'Активные сессии',
      devices: 'Устройства',
      devicesDesc: 'Где выполнен вход',
      thisDevice: ' · это устройство',
      revoke: 'Завершить',
      calls: 'Звонки',
      deleteAccount: 'Удалить аккаунт',
      deleteAccountStage: 'Каскадное удаление появится вместе с экспортом данных',
      signOut: 'Выйти из аккаунта',
      direct: 'Прямое соединение',
      directDesc: 'По умолчанию звонок идёт через наш ретранслятор',
      directOn: 'Пробовать прямой путь',
      directOff: 'Всегда через ретранслятор',
      directOnText:
        'Клиент сначала пробует короткий путь и сам откатывается на ретранслятор, если он не' +
        ' складывается. Задержка ниже, но твой IP-адрес видит медиасервер, а не только' +
        ' ретранслятор перед ним.',
      directOffText:
        'Весь звук и видео идут через coturn: твой адрес видит только он. Собеседник не видит' +
        ' его ни в одном из режимов — медиа в любом случае терминируется на нашем сервере.',
      directApplies: 'Применится к следующему звонку.',
    },

    notif: {
      show: 'Показывать уведомления',
      showDesc: 'Только когда окно скрыто или неактивно',
      alwaysOn: 'Всегда включено в этой сборке',
      why:
        'Уведомление о сообщении, которое уже на экране, приучает их игнорировать, поэтому они' +
        ' приходят только когда окно не в фокусе.',
      sound: 'Звук сообщений',
      soundStage: 'Вместе со звуковыми схемами, этап 5',
      dnd: 'Не беспокоить по расписанию',
      stage5: 'Этап 5',
    },

    mail: {
      note:
        'Почтовый модуль — этап 3. Раздел почты в приложении пока макет: письма ненастоящие,' +
        ' приём и отправка появятся вместе с сервером.',
      address: 'Адрес @bmf.ink',
      addressStage: 'Этап 3, после выдачи ящиков по инвайтам',
      imap: 'Подключить внешний ящик по IMAP',
      signature: 'Подпись',
      stage3: 'Этап 3',
      port25: 'Отправка с собственного домена дополнительно ждёт, пока провайдер откроет порт 25.',
    },

    rules: {
      intro: 'Правила применяются к новым письмам сверху вниз: условие — действие.',
      example: 'Пример правила',
      if: 'Если',
      sender: 'отправитель',
      contains: 'содержит',
      then: 'то',
      toFolder: 'в папку',
      markRead: 'прочитано',
      note:
        'Конструктор включится вместе с почтовым модулем на этапе 3 — сейчас он показывает,' +
        ' из чего будет собираться правило.',
    },

    music: {
      folder: 'Папка с музыкой',
      changeFolder: 'Сменить папку',
      changeFolderStage: 'Чтение локальной папки — этап 5',
      sleep: 'Таймер сна',
      crossfade: 'Кроссфейд',
      stage5: 'Этап 5',
      note:
        'Плеер сейчас работает на демонстрационном списке: позиция идёт по таймеру, звук не' +
        ' воспроизводится.',
    },

    ai: {
      note:
        'Помощник работает на твоём ключе — он хранится только на этом устройстве и не уходит' +
        ' на сервер. Это условие раздела, а не настройка.',
      key: 'Ключ API',
      model: 'Модель',
      persona: 'Имя и характер помощника',
      stage5: 'Этап 5',
      pro:
        'В Pro модель уже подключена — ключ вводить не нужно. Подписка и приём платежей появятся' +
        ' на этапе 5; премиум проверяется сервером, а не клиентом.',
    },

    update: {
      unpackaged: 'Обновления работают только в установленном приложении.',
      portable:
        'Портативная сборка не обновляет себя сама — скачай новую версию со страницы релизов.',
      deb: 'Пакет .deb обновляется через менеджер пакетов системы, а не из приложения.',
      checking: 'Проверяю обновления…',
      latest: 'Установлена последняя версия',
      availableDownloading: 'Доступна версия {version} — скачиваю',
      available: 'Доступна версия {version}',
      downloading: 'Скачивается {version} — {percent}%',
      ready: 'Версия {version} загружена и встанет при перезапуске',
      error: 'Не удалось проверить обновления: {reason}',
      noConnection: 'нет связи',
      idle: 'Нажми «Проверить», чтобы узнать о новой версии',
      reading: 'Читаю состояние…',
      installedOnly:
        'Доступно только в установленном приложении — в браузере автозапуском и обновлениями' +
        ' управлять неоткуда.',
      restart: 'Перезапустить и обновить',
      downloadingShort: 'Скачивается — {percent}%',
      checkingShort: 'Проверяю…',
      download: 'Скачать {version}',
      check: 'Проверить обновления',
      failedVersion:
        'Версия {version} скачалась и установилась, но приложение осталось прежним.' +
        ' Больше она предлагаться не будет — обнови вручную со страницы релизов.',
      auto: 'Обновлять автоматически',
      autoDesc: 'Скачивать в фоне, ставить при перезапуске',
      beta: 'Бета-версии',
      betaDesc: 'Предлагать сборки до того, как они станут стабильными',
      history: 'История версий',
      historyDesc: 'Что менялось в каждом релизе',
      open: 'Открыть',
      hide: 'Скрыть',
      historyLoading: 'Читаю список релизов…',
      historyEmpty:
        'Список пока не загружен. Он читается с публичной страницы релизов —' +
        ' проверь связь и нажми «Обновить».',
      historyRefresh: 'Обновить',
      historyFetched: 'Список загружен: {time}',
      historyOffline: 'Показан сохранённый список — свежий загрузить не удалось.',
      historyCurrent: 'установлена сейчас',
      historyBeta: 'бета',
      historyNoNotes: 'Описание не заполнено.',
      historyOnSite: 'Открыть страницу релизов',
      autostart: 'Запускать при входе в систему',
      autostartDesc: 'Стартует свёрнутым в трей',
      lastCheck: 'Последняя проверка: {time}. Дальше — раз в сутки.',
      cadence: 'Проверяется раз в сутки и при запуске.',
      tray:
        'Закрытие окна сворачивает приложение в трей, чтобы уведомления продолжали приходить.' +
        ' Полный выход — через меню в трее.',
      smartScreen:
        'Установщик не подписан сертификатом, поэтому Windows показывает предупреждение' +
        ' SmartScreen при первой установке.',
    },

    keys: {
      note:
        'Шпаргалка открывается клавишей ?. Переназначение появится позже — аварийный сброс' +
        ' останется неизменяемым в любом случае.',
    },

    sounds: {
      note:
        'Схема задаёт звуки всех событий. Свою можно будет собрать и выложить в маркет рядом' +
        ' с темами.',
      pick: 'Выбрать',
      stage: 'Звуковые схемы — этап 5',
      setBmf: 'BMF',
      setBmfDesc: 'Мягкие тоны по умолчанию',
      setClassic: 'Классика',
      setClassicDesc: 'Короткий сигнал',
      setSoft: 'Мягкая',
      setSoftDesc: 'Низкие приглушённые звуки',
      setBright: 'Яркая',
      setBrightDesc: 'Высокие и заметные',
      setMute: 'Без звука',
      setMuteDesc: 'Только визуальные уведомления',
    },

    lang: {
      language: 'Язык',
      languageDesc: 'Другие языки появятся позже',
      russian: 'Русский',
      note:
        'Строки интерфейса лежат в словарях, поэтому добавление языка не потребует правок' +
        ' в компонентах.',
    },
  },

  share: {
    title: 'Демонстрация экрана',
    hint: 'Окно или экран выберешь в системном диалоге — его показывает сам рабочий стол.',
    looking: 'Смотрю, что открыто…',
    empty: 'Нечего показать — система не отдала ни одного окна.',
    withSystemAudio: 'Со звуком системы',
    noAudioDevice:
      '— недоступно: нет устройства, которое отдаёт звук этой машины. На Linux его даёт' +
      ' PulseAudio или PipeWire.',
    start: 'Показать',
  },

  statusPicker: {
    title: 'Мой статус',
    now: 'Сейчас:',
    custom: 'Своё сообщение',
    customPlaceholder: 'Например: пишу диплом до пятницы',
    customHint: 'Заменит подпись статуса, значок останется.',
    auto: 'Авто-статус',
    autoHint: 'Сам меняется: музыка, звонок, «не беспокоить»',
    saved: 'Статус: {status}',
    failed: 'Не удалось сохранить статус',
  },

  profile: {
    heading: 'Всё о профиле',
    name: 'Имя',
    nameSaved: 'Имя обновлено',
    nameFailed: 'Не удалось изменить имя',
    username: 'Юзернейм',
    usernameSaved: 'Юзернейм обновлён',
    usernameTaken: 'Такой юзернейм уже занят',
    usernameFailed: 'Не удалось изменить юзернейм. Только строчные латинские буквы, цифры и подчёркивание',
    avatar: 'Аватар',
    avatarSet: 'Загружен',
    avatarChange: 'Сменить аватар',
    avatarSaved: 'Аватар обновлён',
    avatarCleared: 'Аватар удалён',
    avatarFailed: 'Не удалось изменить аватар',
    lastSeenPrivacy: 'Показывать, когда я был в сети',
    lastSeenPrivacyHint: 'Выключено — другие видят только «в сети» или «не в сети», без времени',
    lastSeenSaved: 'Настройка сохранена',

    /** Somebody else's profile, opened from a chat. */
    contact: {
      title: 'Профиль',
      pinned: 'Закреплённое сообщение',
      photos: 'Фотографии · {count}',
      photosLoading: 'Фотографии',
      noPhotos: 'Общих фотографий пока нет',
    },

    status: 'Статус',
    mail: 'Почта',
    mailStage: 'Появится вместе с почтовым модулем, этап 3',
    stage3: 'Этап 3',
    password: 'Пароль',
    passwordWhere: 'Меняется в настройках, в разделе «Аккаунт»',
    signOut: 'Выйти из аккаунта',
  },

  editChat: {
    titleGroup: 'Настройки группы',
    titleChannel: 'Настройки канала',
    picture: 'Сменить картинку',
    removePicture: 'Убрать картинку',
    descriptionPlaceholder: 'Описание (необязательно)',
    saved: 'Сохранено',
    failed: 'Не удалось сохранить',
    pictureFailed: 'Не удалось загрузить картинку',
    edit: 'Редактировать',
  },

  createChat: {
    groupTitle: 'Новая группа',
    channelTitle: 'Новый канал',
    groupName: 'Название группы',
    channelName: 'Название канала',
    groupHint: 'Группа — общий чат для команды или друзей.',
    channelHint: 'Канал — публикации для подписчиков; писать могут только админы.',
    avatarStage: 'Аватар появится вместе с загрузкой файлов',
    members: 'Участники и права',
    whoToAdd: 'Кого добавить в «{title}»',
    searchPlaceholder: 'Имя пользователя, минимум 2 символа',
    searchHint: 'Найди участников по имени пользователя',
    searchNone: 'Никого не нашлось',
    createCount: 'Создать ({count})',
    roleMember: 'Участник',
    roleSubscriber: 'Подписчик',
    roleAdmin: 'Администратор',
    groupCreated: 'Группа создана',
    channelCreated: 'Канал создан',
    groupFailed: 'Не удалось создать группу',
    channelFailed: 'Не удалось создать канал',
  },

  market: {
    title: 'Маркет',
    tabThemes: 'Темы',
    tabSkins: 'Оформление',
    tabPlugins: 'Плагины',
    stage5: 'Появится на этапе 5',

    themesHint: 'Тема — конфиг с цветами и параметрами. Применяется мгновенно, ничего не выполняет.',
    themeApplied: 'Тема «{name}» применена · сброс — Ctrl+Alt+R',
    brokeTitle: 'Тема сломала интерфейс?',
    brokeBefore: 'Нажми ',
    brokeAfter: ' — вернётся стандартное оформление. Работает всегда, даже если кнопки не видно.',

    importTitle: 'Импорт темы',
    importHint: 'Вставить конфиг из буфера',
    importAction: 'Вставить',
    imported: 'Тема применена из буфера',
    importEmpty: 'В буфере нет конфига темы',
    clipboardDenied: 'Нет доступа к буферу',
    exportTitle: 'Экспорт текущей',
    exportHint: 'Скопировать конфиг темы',
    exportAction: 'Копировать',
    exported: 'Конфиг темы скопирован',

    skinsHint:
      'Оформление — текстовый конфиг: формы кнопок, иконки, плотность, анимации. Кода внутри' +
      ' нет, поэтому ставится без разрешений.',
    apply: 'Применить',
    offlineTitle: 'Работает офлайн',
    offlineHint:
      'Темы и оформления не выходят в сеть и не читают переписку — внутри только параметры.',

    pluginsHint:
      'Плагины добавляют кнопки и умеют отправлять данные наружу — поэтому просят разрешения.',
    pluginNetwork: 'отправляет данные наружу',
    pluginOffline: 'работает офлайн',
    install: 'Установить',

    permsTitle: 'Что получит плагин',
    permsInstall: 'Установить с этими правами',
    permsAsks: 'запрашивает доступ:',
    permsNeeded: 'нужно',
    permMessage: 'Текст сообщения, на котором нажали кнопку',
    permMessageHint: 'Только по твоему действию, не автоматически',
    permNetwork: 'Отправка на один адрес из манифеста',
    permNetworkHint: 'Других адресов плагин использовать не сможет',
    permsDeniedBefore: 'Плагин ',
    permsDeniedBold: 'не получит',
    permsDeniedAfter:
      ': другие чаты, почту, заметки, контакты, файлы на компьютере, доступ к камере и микрофону.',
    permsStage: 'Плагины появятся на этапе 5 — этот экран показывает, что именно у тебя спросят.',

    skin: {
      square: 'квадратные аватары, плотный список',
      bubble: 'круглые кнопки, крупные пузыри',
      compact: 'минимум отступов, больше строк',
      playful: 'пружинные анимации, свои иконки',
    },
    plugin: {
      notion: 'В Notion',
      todoist: 'В Todoist',
      wordCount: 'Счётчик слов',
      translate: 'Перевод выделенного',
    },
  },

  messageMenu: {
    moreReactions: 'Другие реакции',
  },

  resetBanner: {
    title: 'Оформление сброшено',
    text: 'Вернулись стандартная тема, цвета и расположение панели',
  },
} as const;
