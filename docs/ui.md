# The page's UI

How every part of the homepage works, what the review of it found, what
current practice says about each pattern, and what the page does now. The
code is the source of truth; this is the map to it.

## How the page is put together

`src/index.html` loads `src/client.tsx`, which renders `App`
(`src/app.tsx`): preact-iso's router over the routes effect-start writes into
`src/routes/_manifest.ts`, inside an error boundary. There is one page,
`src/routes/_page.tsx`, and any other path shows it too. The page is a
column of bands, each a `Band` at the width its content reads best at:

| Band | Component | What it does |
| --- | --- | --- |
| Header | `Header`, `Socials`, `ConnectButton`, `HouseLogo`, `Wordmark` | The dot-matrix house and wordmark (`DotMatrix` over the dot maps in `dots.ts`), the social links and the one wallet button. |
| Our Story | `BasedHouseStory` (`Story.tsx`, data in `story.ts`) | A scroll-snap reel of chapters with a dot rail. It opens on the interview and holds it while the page settles; off-centre cards are `inert`; the arrow keys, dots and swipes move it. A chapter can lead with a `Film` (no download until Watch) or a `Cover` of one or two photos. |
| Based House Mumbai | `BasedHouseCard`, `FundingCard`, `BasedHouseBlueprint` | The raise and how to give; the BasedPaint blueprint the reader can pick up and drop, with reduced motion honoured. |
| Homebase Map | `MapCard`, `MapView`, `EventList`, `EventDetails`, `AddEventDialog` | Luma events pinned on Base, on a MapLibre map and in a list that point at each other. `docs/map.md` covers it in full. |
| Homebase Live | `LiveCard`, `AddCalendarDialog` | Streams ahead from the calendars the admin added, by day, in any zone. `docs/live.md` covers it in full. |
| Videos | `VideoGallery` (data in `videos.ts`) | Talks and build sessions; YouTube plays in a dialog, anything else opens where it was posted. |
| Footer | `Footer` | The house and the social links again. |

Underneath, the browser talks to three endpoints through `call` in
`src/call.ts`, and to the wallet through `src/wallet/client.ts`, which loads
the wallet bundle (`src/wallet/wagmi.ts`) only when it is first needed and
runs every transaction through `transact`.

## The building blocks

Every section is now made of the same few pieces:

| Piece | Where | Replaces |
| --- | --- | --- |
| `btn` with `btn-brand`, `btn-quiet`, `btn-small`, `btn-text`, `btn-danger`; `btn-icon`; `chip`; `field` | `client.css` | `btn-brand` and a dozen hand-written pill, chip and link styles |
| `Dialog` | `ui/Dialog.tsx` | four hand-built modals |
| `LinkDialog` | `ui/LinkDialog.tsx` | `SubmitDialog` and the old `AddCalendarDialog`, 631 lines that were nearly identical |
| `useAction` | `ui/useAction.ts` | nine copies of busy, error and try/catch state |
| `transact` and `stageLabel` | `wallet/client.ts` | five copies of the wallet try/catch, and one label shown for the whole wait |
| `Notice` | `ui/Notice.tsx` | seven error and success paragraphs, some without a live role |
| `Panel`, `PanelHeader` | `ui/Panel.tsx` | three card shells and two copies of the header bar |
| `Band`, `SectionHeading` | `ui/Layout.tsx` | five page wrappers with different spacing, three section headings |
| `Choices` | `ui/Choices.tsx` | the amount buttons and the Upcoming/Past buttons |
| `Disclosure` | `ui/Disclosure.tsx` | the story's What happened and the funding card's info button |
| `AddToCalendar`, `calendar.ts` | `ui/AddToCalendar.tsx` | Google-only on the map, a data link and Google on Live |
| `EventWhen`, `placeOf` | `ui/map/EventWhen.tsx`, `map/event.ts` | three copies each of the date line and the place line |
| `Icons.tsx` | `ui/Icons.tsx` | icons drawn inline in three files |

## What the review found

Every component, stylesheet rule and client module was read. Each finding
below names where it was, what it did to a visitor and what changed.

### Dialogs

- Four modals (the wallet, Add an event, Add a calendar, the video) each drew
  its own backdrop, listened for Escape on the window and portalled itself to
  the body. None kept Tab inside it, none handed focus back on close, and the
  page scrolled behind all of them. The video modal had no dialog role, no
  name and no Escape.
- Now: one `Dialog`, the native modal `<dialog>`. The browser keeps focus
  inside, makes the page inert, closes on Escape, lifts it into the top layer
  over every section and returns focus to the opener. A press on the backdrop
  closes it, and the page stops scrolling behind it. On a phone it is a sheet
  on the bottom edge with a visible close button.

### Funding card

- Buy $home, Lock $home and Donate were three equal blue buttons. The amount
  chips above them applied only to Donate. On a desktop, Lock $home wrapped
  to two lines.
- Donate with no wallet opened the wallet dialog, and after connecting the
  visitor had to find Donate and press it again.
- The button read Confirm in wallet… for the whole wait, up to two minutes,
  after the wallet had already confirmed.
- How the money is used sat behind an unlabeled (i) icon.
- The thank-you was a `role="status"` paragraph inserted along with its text,
  which screen readers do not reliably announce.
- Now: Donate is the card's one primary action and names the amount (Donate
  0.01 ETH). It sits under the amount radios it uses. Buy and Lock $home are
  quiet buttons marked as leaving the page. Donate with no wallet says what
  is waiting and goes ahead once a wallet connects, through the card or the
  header; the wallet still asks first. The button says Confirm in your
  wallet… until the wallet signs, then Waiting for Base…. The bullets are
  behind a labeled How funding works. Messages go into live regions that are
  on the page before they are needed.

### Choosing one of a few

- The amounts and Upcoming/Past were buttons with `aria-pressed`, a pattern
  for on/off toggles, used here for picking one of several.
- Now: `Choices`, native radios drawn as chips. Tab reaches the group once,
  the arrow keys move the choice, and a screen reader says 2 of 3.

### Homebase Live

- The Location select had no label tied to it. For a viewer in UTC it was
  blank, because `Intl.supportedValuesOf("timeZone")` does not list UTC.
  Options showed only the city, and times had no zone.
- The iCalendar link was a `data:` URL, which Safari on iPhone will not open.
  The file had no DTSTAMP, which RFC 5545 requires, no escaping of commas
  and semicolons, and no line folding. An all-day event was written as
  midnight UTC.
- Each day showed the date three times: a calendar tile, the weekday and the
  full date.
- Now: a labeled Times in select, opening on the viewer's zone, with UTC
  always present. Options read as city, region and offset, sorted by city so
  typing a city's first letters finds it. Days read as Today ·, Tomorrow · or
  the full date once. Each event shows its time and zone, its own link, and
  Add to calendar.

### Map

- Add to calendar on the map offered Google only.
- Online events read in the host's zone, though a viewer joins from their
  own.
- The date line and the place line were written out separately in the row,
  the card and the add dialog's preview.
- Now: the shared `AddToCalendar`, the shared `EventWhen` and `placeOf`, and
  online events in the viewer's zone, as Luma shows them. The card has one
  primary action (Open on Luma), and its remove error is announced.

### Videos

- The video cards were `div`s with a click handler, so the keyboard could
  not open them.
- The grid was clipped to 1000 pixels under a fade, and the sticky See all
  videos button sat on top of a title.
- The two videos not on YouTube opened a dialog saying the content could not
  be embedded, with a button to open it elsewhere.
- Embeds used youtube.com, which sets cookies before anything plays.
- Now: six videos, then See all 16 videos, which shows the rest and moves
  focus to the first new one; nothing hidden can take focus. Each video is a
  button, or a link straight out for the two posted elsewhere. YouTube plays
  in the shared dialog, through the privacy-enhanced player, starting at
  once.

### The rest

- A placeholder `/about` page reading About meowus was live, and any other
  path rendered an empty page. Both now show the homepage.
- daisyUI and a pastel theme were configured, but no daisyUI class was used
  anywhere. Both are gone, along with an unused animation and a commented-out
  layout.
- The Farcaster link was `http://warpcast.com`; it is now
  `https://farcaster.xyz/homebase`. The Dexscreener link is the one
  `HomeTokenUrl` the funding card uses.
- The wallet list replaced a button that had just been disabled under the
  reader's focus, dropping focus to the page. The list now loads under a
  plain Finding wallets… line and takes focus when it arrives.
- Buttons, chips and fields share one focus ring. Every button is at least
  24 pixels each way, the smallest target WCAG 2.2 allows, and a full-size
  button is 44 pixels tall.

## What practice says, and what the page does about it

**Dialogs.** A modal opened with `showModal()` sits in the top layer, makes
everything else inert and closes on Escape; focus starts on an `autofocus`
element or the first control
([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog),
[web.dev](https://web.dev/articles/baseline-in-action-dialog-popover)).
`closedby="any"` gives light dismiss in Chrome 134 and Firefox 141 but not
Safari ([Chrome 134](https://developer.chrome.com/release-notes/134),
[caniuse](https://caniuse.com/mdn-html_elements_dialog_closedby),
[WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=284592)), so the
backdrop press is handled in script. The page behind keeps scrolling unless
the root is locked, which `html:has(dialog:modal)` does
([web.dev](https://web.dev/articles/building/a-dialog-component)). Sheets need
a visible close button ([NN/g](https://www.nngroup.com/articles/bottom-sheet/)).

**One primary action per area.** Carbon allows one primary button per page
([Carbon](https://carbondesignsystem.com/components/button/usage/)), Material
one prominent button per screen
([Material](https://m3.material.io/components/all-buttons)), and Atlassian one
per area ([Atlassian](https://atlassian.design/components/button/examples)).
NN/g keeps the colour for the primary action, since buttons that share a
colour read as equally important
([NN/g](https://www.nngroup.com/articles/gestalt-similarity/)). So each card and
dialog has one `btn-brand`, and everything else is `btn-quiet` or `btn-text`.

**Reusing styles with Tailwind.** Tailwind's advice is to reuse markup through
components. Small, widely repeated pieces may be classes, and class names
must be written out whole so the scanner finds them
([reusing styles](https://tailwindcss.com/docs/reusing-styles),
[detecting classes](https://tailwindcss.com/docs/detecting-classes-in-source-files)).
That is why buttons, chips and fields are classes in `client.css`, they are
also drawn by the map's own markup outside Preact, and everything bigger is a
component.

**One of a few.** Single-choice toggle groups are radio groups in both Radix
([releases](https://www.radix-ui.com/primitives/docs/overview/releases)) and
React Aria ([ToggleButtonGroup](https://react-spectrum.adobe.com/react-aria/useToggleButtonGroup.html)).
The APG radio pattern brings the arrow keys
([APG](https://www.w3.org/WAI/ARIA/apg/patterns/radio/)), and native radios
give them for free. GOV.UK's radios separate a different option with "or"
([GOV.UK](https://design-system.service.gov.uk/components/radios/)), which is
how Custom sits beside the presets.

**Wallets.** RainbowKit says to act on the account's state rather than on the
connect modal, since a wallet can connect from anywhere
([RainbowKit](https://rainbowkit.com/docs/modal-hooks)). That is what the
waiting donation does. Wagmi tells awaiting a signature apart from waiting on
a receipt ([wagmi](https://2.x.wagmi.sh/react/guides/send-transaction)), and
`stage` carries the same two states to every button. A refusal is code 4001
([EIP-1193](https://eips.ethereum.org/EIPS/eip-1193)) and reads as You
didn't approve the transaction. Wallets are found through EIP-6963
([EIP-6963](https://eips.ethereum.org/EIPS/eip-6963)), as before.

**Calendars.** RFC 5545 requires UID and DTSTAMP on every event. It escapes
backslash, semicolon, comma and newline in text, folds lines at 75 octets,
and writes all-day events as dates
([RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)). Safari on iPhone
refuses to open `data:` URLs, so the file is a download.
`calendar.test.ts` checks each rule.

**Time zones.** Luma shows an event held somewhere in its own zone, an online
event in the viewer's, and both in lists when they differ
([Luma](https://help.luma.com/p/understanding-timezones)). NN/g's guidance on
zone pickers is to default to the detected zone, find a zone by city, show
the region and the offset, and sort by city
([NN/g](https://www.nngroup.com/articles/time-zone-selectors/)).

**Disclosure.** Icons need text labels
([NN/g](https://www.nngroup.com/articles/icon-usability/)), and GOV.UK's
details component suits secondary information, under a short label that says
what is inside
([GOV.UK](https://design-system.service.gov.uk/components/details/)).

**Video.** Privacy-enhanced mode is youtube-nocookie.com
([YouTube Help](https://support.google.com/youtube/answer/171780?hl=en)). A
player that loads only on a press is the facade pattern
([Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/third-party-facades)).
A press is the user activation that lets the delegated player start
([Chrome](https://developer.chrome.com/blog/autoplay)). After Load more,
focus moves to the first new item
([A11Y Project](https://www.a11yproject.com/posts/a-guide-to-troublesome-ui-components/)).
A control that takes focus must not be hidden, as one clipped by `overflow`
is (Focus Not Obscured, [WCAG 2.2](https://www.w3.org/TR/WCAG22/)).

**Pending and errors.** React 19 puts the pending state and the last result
of an action together
([useActionState](https://react.dev/reference/react/useActionState)), which
is what `useAction` does. Errors go in `role="alert"`, confirmations in
`role="status"`
([MDN alert](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alert_role),
[MDN status](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role)),
and the region is on the page before its message is.

**Loading.** Skeletons suit a page or a list loading, and a spinner a single
module ([NN/g](https://www.nngroup.com/articles/skeleton-screens/)). The map
list and the raise keep their skeletons, and Live its spinner.

## Where the page goes past the usual

- No dialog library: the browser's own modal supplies focus, inertness and
  the top layer, so there is nothing to keep in step with it.
- Donations resume after connecting, from any way in, and each transaction
  button says which of the two waits it is in. Both come from one place.
- The calendar file is tested against the RFC rather than copied from an
  example.
- Every choice of one is a native radio, every disclosure a native
  `details` and every dialog a native `dialog`.

## Open questions

- Raised for Based House counts the $home fee share only, so a donation does
  not move it (`docs/live.md` notes this as a later step). The card could
  say so, or count transfers to the address too.
- The funding bullets link Based House to one form
  (`BasedHouseMumbaiUrl`, forms.gle/ZKkD9…), the story's Apply button to
  another (forms.gle/54EtY…), and the announcement image names a third.
- Donate leads the funding card because the amount choice belongs to it. If
  buying $home should lead instead, swap which button wears `btn-brand`.
