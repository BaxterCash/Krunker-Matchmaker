# Krunker Matchmaker

A lightweight Glorp userscript. Current version: **1.0.2**.

Put `Matchmaker.user.js` in `Documents/glorp/scripts` and enable Userscripts in Glorp. Keep one copy; store backups outside the scripts folder. Glorp controls when edited scripts are loaded again.

**F2** toggles the menu. **F8** switches once using your filters. Maps, modes and regions support multiple selections. The map selector and matching use standard built-in maps.

## Finding more lobbies

The old view stopped at twelve rows. Results now show 24 at a time, with **Show more** to reach the remainder.

New defaults require one player and no minimum time remaining. Existing saved filters are preserved. **Clear filters** clears map/mode/region selections, player/time/ping limits and lobby-type restrictions, while preserving UI settings and the standard-map/full/locked/entry-fee checks.

Open **Settings → Match breakdown** to see which restrictions removed lobbies. Counts assign each excluded lobby to its first failing check; they are not overlapping totals. Different map only applies additionally to quick switch.

Each switch checks one candidate again before navigating. Full, locked, paid, incompatible and no-longer-matching lobbies are rejected. No waiting for slots, queue or automatic retry. Green SWITCHING means the final eligibility check passed; a slot cannot be reserved.

## Updates

The script checks once per Glorp WebView session:
1. The latest stable GitHub Release.
2. The `Matchmaker.user.js` file on `main`.

The newer valid version wins. In the source file, `@version` and `VERSION` must agree; increase both when publishing changes. Stable versions use `X.Y.Z`. This also detects source updates when a release tag is missing or older.

A newer version shows an orange **Update available** link. It opens the release or source page. **You download and replace the local file yourself.** Remote source is read as text for version checking; it is never executed or installed automatically. Offline and rate-limit failures do not interrupt games or trigger retry loops.

The first load of a changed local version shows an orange **UPDATED** notice for five seconds. Ordinary launches of the same version do not repeat it.

Version 1.0.2 keeps the green switching message green across navigation and carries its original expiry instead of restarting the timer. The default is three seconds; the old four-second default is migrated once, and later explicit custom duration choices remain supported.

## Other settings

Message size/duration, configurable switch shortcut, player/time limits, Different map only, regional ping estimate cap, and optional button hiding with hover reveal. Destination ping is an estimate, not a measured guarantee.

## Validation

Version 1.0.2 was checked against a captured 411-lobby response. With all regions selected, old default limits matched 28 lobbies and new defaults matched 51 in that snapshot. Counts change as servers fill, end and change maps.

Focused browser checks cover pagination, saved-filter preservation, clear-filter safety, live-snapshot eligibility, version consistency, release/source update selection, single navigation, cancellation and full-lobby rejection. No long-session gameplay or native startup-focus claim is implied.



