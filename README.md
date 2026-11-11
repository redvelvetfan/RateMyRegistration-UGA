# RateMyRegistration

A Chrome extension that shows RateMyProfessors ratings inline on UGA's Athena course registration portal, no more tab-switching during registration.

## Features

- Ratings appear next to professor names directly in the class search results
- Click any rating badge to open the professor's full RateMyProfessors page
- Handles nickname mismatches (e.g. Brad vs. Bradley), middle initials, hyphenated names, and diacritics
- Two-pass search: tries full name first, falls back to last name to catch nickname variants
- Session cache deduplicates API calls so the same professor is only looked up once

## Feedback Form:
[RMR Feedback Form](https://forms.gle/pVJyYN8BbK6LX1nX7)


## How It Works

- A content script watches `table#table1` on Athena for professor name links (`a.email`) using a `MutationObserver`
- Each name is sent to a background service worker, which queries the RateMyProfessors GraphQL API filtered to UGA (school ID 1101)
- Results are matched using token-based fuzzy matching (prefix nicknames, stripped initials, diacritic normalization) and cached for the session
- A small badge is injected next to the professor's name showing their average rating

## Stack

- Manifest V3 Chrome Extension
- Vanilla JS (no build step)
- RateMyProfessors GraphQL API
