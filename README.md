# Krunker Matchmaker

Glorp userscript, put `Matchmaker.user.js` in `glorp/scripts` and enable Userscripts. Keep one copy; keep backups outside that folder.

## Controls

- **F2:** open or close the menu.
- **F8** (customizable): start a lobby search; press again to cancel. Cancellation starts the normal **0.5-second cooldown**.
- **Settings → Search duration:** maximum search time, **1–30 seconds**, default **5**. A verified match ends the search early.

## Filters and display

Maps, modes and regions allow multiple selections. Only standard built-in maps are matched. **Show more** exposes all results, 24 per page.

New-install defaults require one player and no minimum time. Saved choices are preserved. **Clear filters** clears map/mode/region selections and player/time/ping/lobby-type restrictions while preserving UI preferences and standard-map/full/locked/entry-fee safeguards.

**Settings → Match breakdown** shows why listed lobbies are excluded, assigning each to its first failing filter. Different map only is an additional restriction for hotkey searches.

Other settings include message size/duration, regional ping estimate, shortcut and hiding the menu button until hovered. The toolbar is hidden during active pointer-locked gameplay and returns in the menu or on pause.

