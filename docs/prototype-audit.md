# Prototype vs. client — the full difference list

Task #27 from the 2026-08-03 defect list. The point of this document is to make the
list of missing screens *finite*: voice messages were found by accident, so the
assumption was that more of the same is hiding. It is. This walks
`docs/ui-prototype.html` top to bottom — markup (lines 1102–1632) and behaviour
(lines 1633–4181) — against `desktop/src`, and records every place the two
disagree.

Method: every prototype control was located in the client by class name, handler
or string. "Missing" below means no code renders it, not that it looked absent.

## Verdicts

| Verdict | Meaning |
|---|---|
| **missing** | The prototype has it, the client has no code for it at all. |
| **partial** | Rendered, but a material part of the behaviour is absent. |
| **divergence** | Built differently. Needs a decision, not necessarily a fix. |
| **staged** | Absent on purpose, and the UI says which stage it belongs to. Not a defect. |

Counts, over the 110 numbered rows below, by the verdict in the last column:
**44 missing**, **11 partial**, **5 divergences**, **6 staged**, **42 ok**. Two
rows (W-3, K-1) carry a note instead of a verdict. The unnumbered side-panel
table in section 12 is not counted.

The staged rows are listed for completeness only — they are already honest in the
UI and should not be planned as defects.

**Refreshed for 0.3.2 (2026-08-04.)** The first pass was written against 0.3.1 and
went stale within a day: fourteen rows were fixed while still reading "missing"
here, which is exactly the failure this document exists to prevent. Every row was
re-checked against the code before this revision, not against the changelog. When
you close something, move its row in the same PR.

---

## 1. Shell and navigation

| # | Prototype | Client | Verdict |
|---|---|---|---|
| S-1 | Three nav placements: top / rail / bottom (`setLayout`, `LAY_CARDS`) | `App.tsx:174` renders all three slots, `Customization.tsx` switches them | ok |
| S-2 | Mail and music buttons can be hidden (`toggleRail`, `railVis`) | `theme.sections`, `App.tsx:154–162` | ok |
| S-3 | Nav badges | Real unread for chats and mail, `App.tsx:163` | ok (better than prototype) |
| S-4 | Notes is a **pinned chat** at the top of the chat list (`CHATS` id 0, `kind:'notes'`), and `#notesView` replaces `#chatView` | Notes is a **fourth nav section** (`Nav.tsx`, `Section = … \| 'notes'`) | **divergence** |
| S-5 | AI assistant is a pinned chat (`id:-1`, `kind:'ai'`, `.ai-ico`, `.m.ai-typing`, per-kind placeholder and status line) | No AI row anywhere; `feat/stage5-ai` adds only the settings panel | **missing** |
| S-6 | Window buttons: minimise, windowed mode, hide to tray | `WindowControls.tsx` | ok |

## 2. Chat list

| # | Prototype | Client | Verdict |
|---|---|---|---|
| C-1 | Five folders with counts | `Messenger.tsx:74–87` | ok |
| C-2 | Pinned chats always visible and sorted first (`c.pin`, `inFolder` bypass) | No pinning of chats at all | **missing** |
| C-3 | Kind icon in the row (`.ci-kind`: group / channel / ai) | Not rendered | **missing** |
| C-4 | Presence mark on the avatar (`.av-st`, dot or emoji per `statusStyle`) | Dot present and coloured by status (`dotStyle`, `Messenger.tsx:218`); the emoji style is still only in `Contacts.tsx` | **partial** — the dot lands, the style switch is U-2 |
| C-5 | `Вы: ` prefix on your own last message | Raw body only, `Messenger.tsx:193` | **missing** |
| C-6 | `Мария: ` prefix on group messages | Not rendered | **missing** |
| C-7 | Draft preview `Черновик: …` | Rendered at `Messenger.tsx:188`, but **nothing ever writes a draft**: `place()` accepts only `folder` and `isLater` (`store/app.ts:69`), and `ChatView` clears the input on chat switch (`Messenger.tsx:439`). The branch is unreachable. | **partial** |
| C-8 | `⏱ позже` marker | ok | ok |
| C-9 | Double click opens the chat in its own floating window (`popChat`, `.cw`, draggable, own input, own send) | No code | **missing** |
| C-10 | Sidebar search filters chat names | Client searches messages server-side | divergence (client is better; keep) |

## 3. Chat header

| # | Prototype | Client | Verdict |
|---|---|---|---|
| H-1 | Avatar and title open the chat-info panel (`openChatInfo`) | Both open `ChatInfo.tsx` (`Messenger.tsx:838–851`) | ok — closed 0.3.2 (defect #24) |
| H-2 | Search button opens the palette | Absent from `.ch-acts` | **missing** |
| H-3 | `⋯` chat menu | Absent | **missing** |
| H-4 | Audio and video call buttons | ok | ok |
| H-5 | Defer-reading button | ok | ok |
| H-6 | Status line: `N участников, M в сети` / `N подписчиков` / `в сети` / `был(а) недавно` | Real counts from the roster, and a DM line that names the status rather than only "в сети" | ok — closed 0.3.2 |
| H-7 | — | Privacy-mode button (client only, stage 1) | divergence (intended) |

## 4. Chat body

| # | Prototype | Client | Verdict |
|---|---|---|---|
| B-1 | "Слушаете вместе" bar (`.together`) | No code | **missing** (belongs with stage 5 music) |
| B-2 | Clicking the pin bar jumps to the message and flashes it (`jumpToPin`) | The strip steps to the next pin but never scrolls the list to it | **partial** — stepping works, jumping does not |
| B-3 | One pinned message | Many, newest first, capped at 50; the strip counts them and steps round | ok — closed 0.3.2, ahead of the prototype (defect #28) |
| B-4 | Drag-and-drop overlay (`#drop`, dragenter/leave/drop on `#chatView`) | No code | **missing** |
| B-5 | Paste an image from the clipboard | No code | **missing** |
| B-6 | Per-chat accent colour (`setChatAccent`, `--acc` on `.msgs`) | No code | **missing** |
| B-7 | Chat background image | ok (`theme.chatBg`) | ok |
| B-8 | Per-kind empty state (`Здесь пока пусто — напиши первым`) | Only a global "Выберите чат" | **partial** |

## 5. Message bubble

| # | Prototype | Client | Verdict |
|---|---|---|---|
| M-1 | Images render inline (`.m-img`) and open the viewer/editor | Inline `.m-img` with a placeholder while the bytes arrive; click opens `ImageViewer` | ok — closed 0.3.2 (defect #1). The editor is A-1 and still absent. |
| M-2 | File card: real name, size, extension badge | All three (`Messenger.tsx:388–397`); the name is carried by migration 0010 | ok — closed 0.3.2 |
| M-3 | Voice message: waveform, duration, transcript (Pro) or lock | No code | **missing** — defect #26 |
| M-4 | Sticker bubble enlarged | Rendered when `kind === 'sticker'` | ok (size is defect #16, CSS) |
| M-5 | GIF bubble (`.m-gif`) | No code | **missing** |
| M-6 | Track card with cover and play (`.tr-card`) | No code | **missing** |
| M-7 | Mail card, clickable through to the letter (`.mail-card`) | No code | **missing** |
| M-8 | `Переслано от <b>имя</b>` | Literal `Пересланное сообщение`, no author | **partial** |
| M-9 | Reply quote shows the author (`.m-reply-n`) | Resolved from the roster, falling back to `Ответ` when the author is not known | ok — closed 0.3.2 |
| M-10 | Sender name in groups, coloured deterministically (`.m-from`, `senderCol`) | Rendered with `colourOf(senderId)` (`Messenger.tsx:363`) | ok — closed 0.3.2 |
| M-11 | Reaction chips | ok | ok |
| M-12 | Scheduled line, `закреплено`, `изменено` | ok | ok |

## 6. Message context menu

| # | Prototype | Client | Verdict |
|---|---|---|---|
| X-1 | Four quick reactions plus a 32-emoji expander | ok (`MessageMenu.tsx`) | ok |
| X-2 | Reply, forward, copy, edit, pin, delete | ok | ok |
| X-3 | `В заметки` — forwards the message into the notes module | **missing** |
| X-4 | `Напомнить позже` — creates a reminder note and toasts later | **missing** |

## 7. Composing and sending

| # | Prototype | Client | Verdict |
|---|---|---|---|
| W-1 | Reply / edit bar | ok | ok |
| W-2 | Scheduled-send bar and right-click menu with four presets | ok | ok |
| W-3 | Exact date and time picker for scheduling | Absent in both | (defect #18, new work) |
| W-4 | Send-mode dots, text ⇄ voice (`.send-dots`, `setSendMode`, `syncSendMode`) | No code | **missing** |
| W-5 | Voice recording with a running timer in the placeholder (`startRec`/`stopRec`) | No code | **missing** — defect #26 |
| W-6 | Textarea grows with the text, capped at 110 px (`autoH`) | Fixed `rows={1}` | **missing** |
| W-7 | Placeholder per chat kind | Only the channel case | **partial** |
| W-8 | Emoji / sticker panel: recent tab, per-pack tabs, GIF tab, store link | Emoji and packs only — no recent, no GIF, no store button | **partial** |

## 8. Screenshot editor

| # | Prototype | Client | Verdict |
|---|---|---|---|
| A-1 | Whole `#annOv` editor: pen, rectangle, arrow, blur, five colours, undo, send. Entered by dropping or pasting an image, or by clicking a received one. | No code anywhere | **missing** (whole feature) |

## 9. Notes

| # | Prototype | Client | Verdict |
|---|---|---|---|
| N-1 | Folder strip with counts | ok | ok |
| N-2 | `+ Папка` creates a folder | No control | **missing** |
| N-3 | Four templates on create (`NOTE_TPL`, `lpMode='tpl'`) | Creates an empty note directly | **missing** |
| N-4 | Edit ⇄ preview toggle | ok | ok |
| N-5 | Checkboxes toggle by clicking in preview (`toggleChk`) | Rendered, not clickable | **missing** |
| N-6 | Move a note between folders (select in the editor meta row) | No control | **missing** |
| N-7 | Send a note to a chat (`ntSend` → `notesend` picker) | No control | **missing** |
| N-8 | Delete | ok | ok |
| N-9 | Forwarded badge on the card (`.nt-card-fwd`) | Not rendered | **missing** |
| N-10 | `.nt-tpl-b` is the template button | Reused in `Notes.tsx:33–35` for markdown list rows | **divergence** — wrong class for the job, will fight any restyle of templates |

## 10. Mail

Stage 3 is explicitly unfinished, and the client says so on every control. Listed
for completeness; only the last row is a real gap.

| # | Prototype | Client | Verdict |
|---|---|---|---|
| E-1 | Compose | disabled, "Появится на этапе 3" | staged |
| E-2 | Reply / forward / discuss in chat | disabled, staged | staged |
| E-3 | Folders with unread counts, categories | ok | ok |
| E-4 | Reading pane | ok | ok |
| E-5 | `Правило` — create a mail rule from the open letter | No button | **missing** |
| E-6 | `Отписаться` — move sender to spam | No button | **missing** |
| E-7 | `В задачи` (Pro) | No button | **missing** |
| E-8 | `Удалить` | No button | **missing** |
| E-9 | Rules editor: conditions, actions, target folder, dry run | Settings has a `rules` screen; the prototype's editor is not ported | **partial** |

## 11. Music and player

| # | Prototype | Client | Verdict |
|---|---|---|---|
| P-1 | Pill: prev/play/next, shuffle, repeat, volume, seek, drag to change track | ok, all of it (`Pill.tsx`) | ok |
| P-2 | Now playing overlay | ok | ok |
| P-3 | `В чат` from the overlay and from each track row | Toast stub / disabled | staged (stage 5) |
| P-4 | `Таймер` button in the overlay | Absent | **missing** |
| P-5 | `Слушать вместе` | Absent | **missing** (Pro, stage 5) |
| P-6 | Scan folder | disabled, staged | staged |
| P-7 | Sleep timer, crossfade | Settings shows "Этап 5" | staged |
| P-8 | Favourite toggle on a track | Rendered; the share button next to it is disabled | partial |

## 12. Side panels (`.lp`)

| Mode | Client | Verdict |
|---|---|---|
| `contacts` | `Contacts.tsx` — search, own contact list, open a chat | ok; adding and local names landed in 0.3.2 (defect #25) |
| `calls` | `Calls.tsx`, real history | ok |
| `forward` | `ForwardPicker.tsx` | ok |
| `chatinfo` | `ChatInfo.tsx` and `UserProfile.tsx` | ok — closed 0.3.2 (defect #24) |
| `newgroup` / `newchannel` | `CreateChat.tsx`, and `EditChat.tsx` for afterwards | ok — avatar and description both land (defects #21, #22) |
| `status` | `StatusPicker.tsx` | **partial**: no icon-style switch (classic ⇄ dot), no Pro rename block |
| `stickers` (store) | — | **missing** |
| `market` | `Market.tsx` — themes, skins, plugins, permission screen, import/export | ok |
| `storewarn` (server ⇄ local storage, with the consequences spelled out) | — | **missing** |
| `tpl`, `notesend`, `sendtrack`, `together`, `discuss`, `perms` | only `perms` exists | **missing** (the rest) |

## 13. Profile (`#pov`)

| # | Prototype row | Client | Verdict |
|---|---|---|---|
| F-1 | Avatar with a `+` overlay, opens a file picker | File picker, upload and clear (`Profile.tsx:124–133`) | ok — closed 0.3.2 (defect #2) |
| F-2 | Name | Editable inline | ok |
| F-3 | Username | Editable, with the taken-name case handled | ok — closed 0.3.2 (defect #2) |
| F-4 | Status | ok | ok |
| F-5 | `О себе` | Absent | **missing** |
| F-6 | Phone | Absent | **missing** |
| F-7 | Mail | staged row | staged |
| F-8 | Password — `Изменить` | Text pointing at the account screen | **partial** |
| F-9 | Profile QR code | Absent | **missing** |
| F-10 | Sign out | ok | ok |

## 14. Settings

All eleven screens exist (`account`, `notif`, `mailset`, `rules`, `musicset`,
`ai`, `update`, `keys`, `sounds`, `lang`, `custom`), and unfinished rows carry an
explicit stage note. What is missing inside them:

| # | Prototype | Client | Verdict |
|---|---|---|---|
| T-1 | Storage mode chips (server ⇄ local) with the warning panel | Absent | **missing** |
| T-2 | Hotkeys: `Задать` records a new combo, conflict detection, reset all | List is read-only (`Settings.tsx:796`) | **missing** |
| T-3 | Appearance: theme, opacity, blur, wallpaper, accent, chat background, layout, emergency reset | All present | ok |
| T-4 | Pro card with a demo toggle | Not ported | divergence — deliberate; Pro is server-side (hard rule 3) |
| T-5 | Beta channel | Toggle backed by `autoUpdater.allowPrerelease` (`Settings.tsx:716–723`) | ok — closed 0.3.2 (defect #12) |

## 15. Search palette

| # | Prototype | Client | Verdict |
|---|---|---|---|
| Q-1 | Filters `от:`, `в:`, `есть:` | `от:` and `в:` only; `есть:` unimplemented and absent from the hint | **partial** |
| Q-2 | Scopes: commands, chats, mail, notes, music, contacts | commands, chats, messages, music | **partial** — mail, notes and contacts missing |
| Q-3 | Arrow-key navigation and Enter | ok | ok |

## 16. Keyboard

| # | Prototype | Client | Verdict |
|---|---|---|---|
| K-1 | 13 bindings | 11 (`shortcuts.ts`) | — |
| K-2 | `Ctrl+Shift+Space` — quick reply overlay (`#qrOv`: most-unread chat, its last message, one input) | Neither the binding nor the overlay | **missing** (whole feature) |
| K-3 | `Ctrl+Shift+N` — new note | Absent | **missing** |
| K-4 | `Ctrl+Alt+R` | Bound in `main.tsx` before user config, as hard rule 9 requires | ok |
| K-5 | Cheat sheet on `?` | ok | ok |

## 17. Statuses

| # | Prototype | Client | Verdict |
|---|---|---|---|
| U-1 | Six presets, custom text up to 40 chars, auto-status | ok | ok |
| U-2 | Icon style: classic emoji ⇄ minimal dot, applied across the list and headers | Absent | **missing** |
| U-3 | Auto-status actually reacts to idleness | Five minutes idle turns the status to `away` and activity turns it back; the chosen status now travels with presence, so other people see it | ok — closed 0.3.2 (defect #11). Music and a call still do not drive it. |
| U-4 | Pro: rename statuses, choose who sees them | Absent | **missing** (Pro) |

---

## What this changes about planning

Three things the defect list did not know. The first is now closed; it is kept
because it is the clearest example of what an audit catches and a defect list
does not.

1. ~~**Group chats are anonymous.**~~ Closed in 0.3.2: sender names and colours
   (M-10), a member list behind the header (H-1), and a status line that counts
   the room (H-6). Nothing in the 32-item defect list said a group was unusable —
   only this walk-through found it.

2. **Four whole features are absent, not partial** — the screenshot editor (A-1),
   the quick-reply overlay (K-2), the pop-out chat window (C-9) and voice
   messages (W-4, W-5, M-3). Each is a day of work at least; none can be sized
   from the defect list, which mentions only the last one.

3. **Two rendered things can never happen**: the draft row in the chat list (C-7)
   and the notes checkboxes (N-5). They look implemented in review and are dead in
   use. Worth grepping for more of this shape before trusting any screen.

Suggested order, by how much each blocks a tester rather than by size. The first
three lines of the original order are done; what follows is what is left.

1. C-3, C-5, C-6 and the rest of C-4 — the chat list is still a wall of
   identical rows: no kind icon, no `Вы:` or `Мария:` prefix.
2. W-6, B-4, B-5 — input that grows, drop and paste. Images can now be sent but
   only through the file button.
3. B-2 — the pin strip steps between pins without scrolling to them, which is
   the half of defect #28 that is still open.
4. M-3, W-4, W-5 — voice messages, the largest thing the defect list does name
   (defect #26).
5. M-8 — `Переслано от <имя>`; the author is already on the message and simply
   is not rendered.
6. Everything else, by the defect list's own order.
