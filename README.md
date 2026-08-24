# Field Notes New Tab

Field Notes is a dependency-free Chrome Manifest V3 new-tab extension. It provides a local clock, Open-Meteo weather and US AQI, saved locations, local shortcut sections, optional frequent-site import, and an optional Todoist Today list.

## Load it locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this folder.
4. Open a new tab. Reload the extension after updating its files.

## Use it

Choose **Set location** to use browser geolocation or search for a city. The chosen location and its weather cache persist in `chrome.storage.local` across Chrome sessions. **Settings & data → Reset location** removes only the saved location and weather cache; it does not remove shortcuts, sidebar settings, Todoist connection, or snoozes.

The Todoist connection is optional. Connecting lets the extension read today’s tasks, complete tasks, and move non-recurring tasks to tomorrow. **Snooze 1h** affects only the local New Tab view.

Chrome’s `topSites` API imports frequently visited sites only. It cannot read Chrome’s protected built-in New Tab tiles.

## Validate

No package installation is required.

```sh
node --check newtab.js
node validate.mjs
```

## Privacy and services

Read [PRIVACY.md](PRIVACY.md) before connecting Todoist or selecting a location. Weather data comes from [Open-Meteo](https://open-meteo.com/), with US AQI sourced from CAMS through Open-Meteo. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution, API-use terms, and rate limits.

## License

This project is available under the [MIT License](LICENSE).
