# Orbit New Tab

**Your bookmarks, in orbit.**

Orbit turns your New Tab page into a collection of floating glass bubbles. Each bubble opens a bookmark, with its size reflecting how often you’ve visited that page recently.

Designed for Vivaldi and Chromium-based browsers, Orbit combines a calm, customizable workspace with folder schedules, changing quotes, and controls that keep your bookmarks close at hand. Everything runs locally in your browser.

## Your bookmarks at a glance

Your most-used pages become larger, while quieter bookmarks stay within reach. By default, Orbit looks at the last seven calendar days and gives the most weight to today’s visits. Bubble growth has a limit, so one busy site cannot take over the page.

In **Settings → Activity**, choose **Today**, **Last 3 days**, **Last 7 days**, **Balanced**, or your own recency weights. You can also turn off automatic resizing. Individual bubbles can have a fixed size or be pinned through their context menu.

Bookmarks with no recent visits remain available. When the window cannot comfortably fit every bubble, **All bookmarks** gives you a searchable list of every currently visible entry, including any that do not fit on the canvas.

Your browser’s bookmark additions, renames, moves, and deletions appear automatically. By default, each bookmark has its own bubble. Enable **Group by website** in **Settings → Bookmarks** to collect saved pages from the same site into a bubble you can open to explore.

## Everyday controls

| Action                         | What it does                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Click a bubble                 | Open the bookmark in the current tab.                                             |
| Middle-click or Ctrl/Cmd-click | Open the bookmark in a new tab.                                                   |
| Drag a bubble                  | Move it to a preferred position, remembered across sessions.                      |
| Right-click a bubble           | Open its menu for pinning, colors, sizes, activity, hiding, editing, and removal. |
| Hover or focus a bubble        | See its title, website, and recent visit counts.                                  |
| Click **All bookmarks**        | Browse the complete list of currently visible bookmarks.                          |

Pinning fixes a bubble’s preferred size and gives its position priority. The layout may still adjust pinned bubbles to make room on smaller screens.

**Hide from Orbit** changes visibility only. Editing or removing a bookmark changes the bookmark in your browser; removal asks for confirmation.

### Search and keyboard shortcuts

Press **B**, **/**, or the search icon to search bookmark names and URLs. These shortcuts stay inactive while you’re typing in a text field.

| Shortcut                  | Action                               |
| ------------------------- | ------------------------------------ |
| **↑ / ↓** in search       | Move between results.                |
| **Enter** in search       | Open the selected result.            |
| **Tab / Shift+Tab**       | Move between bookmarks and controls. |
| **Shift+F10** on a bubble | Open its context menu.               |
| **↓** on a folder button  | Open its schedule and color actions. |
| **Escape**                | Close the current panel or menu.     |

## Folders for work and downtime

Choose the folders in your Orbit library under **Settings → Bookmarks**. Selecting a folder includes its subfolders.

The folder buttons below the heading let you show or hide folders with a click. Subfolders have their own controls, so you can keep part of a collection visible while hiding the rest. Hiding a parent hides its descendants; showing it again preserves each subfolder’s own setting.

Hidden folders leave the canvas, search, and **All bookmarks**. Their bookmarks, colors, and saved positions are kept for when you bring them back. Bubbles make a quick pop-and-fade exit when a folder is turned off.

### Schedule a folder

For example, to show a Work folder only from **9 AM to 5 PM on weekdays**:

1. Hover the **Work** folder button and select the clock in its popup.
2. Enable **Use a schedule** and choose the start and end times.
3. Select **Weekdays**, then **Save schedule**.

Schedules follow your device’s local time and support overnight hours. A folder appears at its start time and hides at its end time. Parent and subfolder schedules both apply.

Clicking a scheduled folder manually overrides its schedule. Choose **Resume schedule** in the folder’s popup, or save its schedule again, to return to automatic visibility.

### Give a folder its own color

Double-click a folder button to choose a color for its bookmarks. The color forms an outer ring that blends into each bubble’s website color toward the center.

Subfolders inherit their parent’s color unless you give them their own. **Use inherited color** restores that connection. You can also change an individual bubble’s color through its context menu.

## A heading that fits your day

Orbit can greet you with a fresh quote on each new tab or reload. **Settings → Header** lets you edit the quotes, choose their hours, or use a fixed heading.

| Quote list        | Default hours | Example               |
| ----------------- | ------------- | --------------------- |
| **Work hours**    | 8 AM–6 PM     | “Ready when you are.” |
| **Leisure hours** | 6 PM–8 AM     | “Where to today?”     |

Each list starts with 15 quotes. Change the Work start and end times to suit your routine; Leisure automatically fills the remaining hours. These hours apply every day and are separate from bookmark-folder schedules.

- Keep **Change the quote on each new tab** enabled for a fresh selection. Orbit avoids repeating the previous quote when another is available.
- Turn off **Choose quotes by time of day** to mix both lists throughout the day.
- Turn off **Change the quote on each new tab**, then edit **Fixed quote**, to keep your own heading on every tab.

Enter one quote per line. Each list supports up to 100 quotes, with up to 120 characters per quote. Text and time edits save when you leave the field; switches save immediately. Invalid edits show a message and keep the last saved setting.

An open tab updates its quote when the time block changes. Searching, opening settings, and bookmark updates keep the current quote in place. Turning a quote option back on restores your saved lists and hours.

## Make Orbit feel like yours

**Settings → Appearance** offers dark, light, and automatic themes, along with gradients, solid backgrounds, and your own background image. The default look is **Lavender dusk**, with bookmark labels appearing **On hover & focus**.

Adjust the glass transparency, blur, color intensity, and icon size to suit your screen. Background images can be PNG, JPEG, or WebP files up to 2 MB.

In **Settings → Layout**, adjust bubble size limits, spacing, center attraction, and movement. Dragged positions are remembered, and you can reset them whenever you want a fresh arrangement.

The heading fades in softly, bubbles arrive with a quick outward motion, and hidden folders pop and fade away. Turn off **Animations** for a still layout. Your system’s reduced-motion preference always takes priority.

## Privacy and your data

Orbit runs locally, without accounts, analytics, telemetry, or remote services. It does not inject code into the websites you visit.

| Browser access       | Why Orbit uses it                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Bookmarks**        | Let you choose folders, display bookmarks, and reflect changes. Editing and removal happen only through your actions. |
| **Browsing history** | Count available recent visits so bubble sizes can reflect your activity.                                              |
| **Local storage**    | Remember settings, quotes, colors, positions, and calculated activity information.                                    |
| **Website icons**    | Display icons already available in your browser’s cache.                                                              |

Your preferences and calculated activity data stay in your browser profile. Orbit works offline; opening a bookmark takes you to its destination as usual. Settings do not automatically sync between devices.

### Back up your preferences

Use **Settings → Data** to export or import your preferences as a JSON file. Exports include appearance, quotes, schedules, and bookmark customizations, without browsing history or visit counts.

Folder selections and bookmark-specific customizations depend on the browser profile they came from. When moving to another profile, you may need to select its folders again.

**Clear cached activity** refreshes Orbit’s calculated information from the history your browser still has. It does not delete browser history or bookmarks.

## Good to know

- Activity reflects the history available to your browser. Missing or cleared history is not reconstructed; bookmarks still remain available.
- Large history collections or restricted access can result in incomplete activity counts. Orbit shows a notice when counts are known to be incomplete or unavailable.
- Website icons depend on your browser’s cache. When an icon is unavailable, Orbit shows the bookmark’s initial and a consistent fallback color.
- Large bookmark collections use compact bubbles and the complete bookmark list to keep every visible entry accessible.
- Changes save locally and survive browser restarts. Open Orbit tabs share settings; if you edit the same settings in multiple tabs, the latest saved change wins.

## License

Orbit New Tab is released under [Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](LICENSE).
