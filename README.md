# AutoPagerize

A userscript that automatically loads the next page of paginated websites and inserts it into the current page.

When you scroll near the bottom of a page, the next page is loaded and appended, so you can keep reading without clicking "Next".

## Installation

1. Install a userscript manager for your browser.
   - Safari (macOS / iOS / iPadOS): [Macaque](https://apps.apple.com/app/id1595306197), Userscripts, Stay, Tampermonkey
   - Chrome / Edge / Firefox: Tampermonkey, Violentmonkey, Greasemonkey
2. Open the following URL. Your userscript manager will show an install screen.

   ```
   https://raw.githubusercontent.com/KC-2001MS/autopagerize/master/autopagerize.user.js
   ```

   If the install screen does not appear, create a new script in your userscript manager and paste the whole content of [`autopagerize.user.js`](autopagerize.user.js).
3. Open a supported website and scroll down.

When AutoPagerize is active on a page, a small square icon appears at the top right of the page. Hover over it to turn AutoPagerize on or off.

## How it works

AutoPagerize uses SITEINFO, a list of per-site rules that describe where the "next page" link and the page content are.

- A SITEINFO snapshot ([`siteinfo.js`](siteinfo.js)) is bundled with the script, so it works right after installation.
- Once a day, the latest SITEINFO is downloaded from [wedata](http://wedata.net/databases/AutoPagerize/items_all.json) (or from `siteinfo.js` in this repository if wedata is unavailable) and saved by your userscript manager. The saved SITEINFO is never removed. You can update it manually with the "AutoPagerize - update SITEINFO" menu command.

To update the bundled snapshot, run `node tools/update-siteinfo.js` and update the commit hash in the `@require` line of `autopagerize.user.js`.

## Code lineage

This script is based on [AutoPagerize](https://github.com/swdyh/autopagerize) by swdyh, which was itself based on GoogleAutoPager and estseek autopager by ma.la.

The original script was shared by the Greasemonkey userscript and the browser extensions for Chrome, Safari and Firefox. This version keeps only the userscript part and is updated to work with current browsers and userscript managers, including those on Safari.

## License

This repository is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for the full text.

The original `autopagerize.user.js` by swdyh is marked "Released under the GPL license" without specifying a version. The GPL allows you to choose any published version in that case, so this repository follows GPLv3.
