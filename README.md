# Krunker Matchmaker

Glorp userscript, version **1.0.3**. Put `Matchmaker.user.js` in `Documents/glorp/scripts` and enable Userscripts. Keep one copy; keep backups outside that folder.

## Controls

- **F2:** open or close the menu.
- **F8** (customizable): start a lobby search; press again to cancel. Cancellation starts the normal **0.5-second cooldown**.
- **Settings → Search duration:** maximum search time, **1–30 seconds**, default **5**. A verified match ends the search early.
- The gray status cycles `SEARCHING`, `SEARCHING.`, `SEARCHING..`, `SEARCHING...`, then repeats.
- Once a lobby passes its final check, green SWITCHING appears before one navigation. Its original notice expiry carries across navigation, without changing back to gray or restarting. Default notice duration: three seconds.

## Search behavior and reliability

Search uses selected maps, modes, regions and limits. It refreshes the list about once per second only while the search is active. Up to three fresh candidates are checked per pass; each lobby ID is checked at most once during that search. A full or changed candidate is skipped in favor of another candidate.

**No slot queue:** a rejected full lobby is not watched for an opening. The search stops on a successful choice, cancellation, deadline or request failure. It never schedules a second navigation or continues after joining. All requests and delayed navigation are cancellation-aware.

The current lobby ID and map can come from Krunker's current-game activity, including when the URL has no `game=` parameter. This fixes the Different map only check for ordinary automatic joins.

A live debugging capture showed a lobby advertised as **7/8** that was **8/8** by its direct check. The old search treated that one stale candidate as failure for the entire operation. The timed search now skips it and examines other eligible lobbies without revisiting it.

## Filters and display

Maps, modes and regions allow multiple selections. Only standard built-in maps are matched. **Show more** exposes all results, 24 per page.

New-install defaults require one player and no minimum time. Saved choices are preserved. **Clear filters** clears map/mode/region selections and player/time/ping/lobby-type restrictions while preserving UI preferences and standard-map/full/locked/entry-fee safeguards.

**Settings → Match breakdown** shows why listed lobbies are excluded, assigning each to its first failing filter. Different map only is an additional restriction for hotkey searches.

Other settings include message size/duration, regional ping estimate, shortcut and hiding the menu button until hovered. The toolbar is hidden during active pointer-locked gameplay and returns in the menu or on pause.

## Updates

Once per Glorp WebView session, the script checks the latest stable release and the script on `main`. The newer valid version wins. Increase both `@version` and `VERSION` together using stable `X.Y.Z` versions.

An orange **Update available** link opens the source or release page. You download and replace the local script manually. Remote source is read only for its version; it is never executed or installed automatically. A changed local version displays UPDATED for five seconds.

Glorp controls when edited scripts are loaded. This update did not restart or reload the running game.

## Validation

Eight focused browser checks cover animation, timed expiry, exact cancellation cooldown, URL-less current-lobby lookup, stale-full fallback, no rechecking of rejected lobbies, settings persistence, later discovery and late-response cancellation. A separate regression verifies that the green notice retains one three-second expiry across navigation. These checks do not claim live combat or long-session acceptance.
