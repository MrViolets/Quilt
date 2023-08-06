# Quilt

Quilt is an automatic tiling window manager for Google Chrome. Layouts consist of a fixed main tile and stacking area where windows will tile dynamically based on the display resolution, orientation and preferences. Popup windows are ignored and will always float freely.

## What it does

- Automatically tiles windows when they are created or closed.
- Tiles windows dynamically based on display resolution, orientation and preferences.
- Can reserve a spot for a fixed size master window in a size ratio of your choice.
- Select a window spacing or choose to have none at all.
- Automatic tiling can be toggled on/off and can be used manually to tile windows on specific displays.

## Install

1. Download and uncompress zip.
2. In Chrome, go to the extensions page at `chrome://extensions/`.
3. Enable Developer Mode.
4. Choose `Load Unpacked` and select the folder.

## Build

1. `npm install` to install dependencies.
2. Update `version` in `manifest.json`.
3. `npm run build`.

## Usage

Once installed, new browser windows you create will be automatically tiled. Click the extension icon for preferences or to enable/disable automatic tiling.

## License

Quilt is licensed under the GNU General Public License version 3.
