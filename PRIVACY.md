# Privacy policy

Field Notes New Tab is a local Chrome extension. It does not use analytics, advertising, remote fonts, or its own server.

## Data stored on this device

The extension stores the following in `chrome.storage.local` for the active Chrome profile:

- Shortcut names, URLs, sections, order, and sidebar width.
- Your selected location, coordinates, and a cached weather response.
- Todoist OAuth client registration data, access and refresh tokens, and the Todoist account time zone after you connect.
- Local Todoist snooze records. These contain an opaque task ID, due-state key, and expiry time.

Chrome extension storage is not encrypted. Anyone who can access this Chrome profile may be able to access this data. The extension requests trusted-context-only storage access when Chrome supports it.

## Data sent to other services

- When you choose a location, the extension sends coordinates to Open-Meteo for weather and air quality. When you search for a city, it sends the search text to Open-Meteo geocoding first, then sends the selected coordinates for weather and air quality.
- When you connect Todoist, the extension opens Todoist’s OAuth flow. It sends OAuth requests and authenticated API requests directly to Todoist. It reads today’s tasks and can complete tasks or move non-recurring tasks to tomorrow only after you use those controls.
- When you import frequent sites, Chrome provides the sites directly through its `topSites` API. The extension does not send them to a server.

## Retention and deletion

**Settings & data → Reset location** deletes only the location and weather cache. **Disconnect Todoist** deletes the Todoist connection. **Clear local data** removes shortcuts, location, weather cache, Todoist connection, snoozes, and sidebar width. You can also remove the extension in Chrome to remove its extension storage.

## Chrome Web Store Limited Use

If published in the Chrome Web Store, Field Notes will comply with the Chrome Web Store User Data Policy, including its Limited Use requirements: user data is used only to provide or improve the extension’s stated features, is not sold or transferred for unrelated purposes, and is not used for creditworthiness or lending decisions.

Contact: Josh Saint Jacque
